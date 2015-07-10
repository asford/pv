define(
    ['extern/underscore', 'extern/jsel', 'mol/mol', 'mol/chain', 'mol/residue', 'mol/atom'],
    function(_, jsel, mol, chain, residue, atom) {

ModelSchema = function( schema_options ) {
  this.includeCore = true;
  this.includeExtended = true;

  if (schema_options)
  {
    console.log(schema_options);
    for (var n in schema_options) {
      this[n] = schema_options[n];
    }
  }
}

ModelSchema.prototype = {

  core_properties : {
    structure : [],
    chain : [ "name" ],
    residue : ["name", "num"],
    atom : ["name", "element", "pos"]
  },

  extended_properties : {
    structure : [],
    chain : [],
    residue : ["index", "insCode", "isAminoacid", "isNucleotide", "ss"],
    atom : ["index", "isHetatm", "occupancy", "tempFactor"],
  },

  /*@param {*} node A node from your data
  * @returns {string} The element name of the node
  */
  nodeName: function(node) {
    if ( node instanceof mol.Mol || node instanceof mol.MolView ) {
      return "structure";
    }
    else if ( node instanceof chain.Chain || node instanceof chain.ChainView ) {
      return "chain";
    }
    else if ( node instanceof residue.Residue || node instanceof residue.ResidueView ) {
      return "residue";
    }
    else if ( node instanceof atom.Atom || node instanceof atom.AtomView ) {
      return "atom";
    }
    else {
      return null;
    }
  },

  child_properties : {
    structure : "chains",
    chain : "residues",
    residue : "atoms",
  },

  /*@param {*} node A node from your data
  * @returns {Array} The children of the node
  */
  childNodes: function(node) {
    return _.result(node, this.child_properties[this.nodeName(node)], null);
  },

  /*@param {*} node A node from your data
  * @returns {Object} A key/value object of the node's attributes
  */
  attributes: function(node) {
    var node_type = this.nodeName(node);
    var select_attributes = [];

    if ( this.includeCore ) {
      this.core_properties[node_type].forEach(function(v) { select_attributes.push(v) } );
    }

    if ( this.includeExtended ) {
      this.extended_properties[node_type].forEach(function(v) { select_attributes.push(v) } );
    }

    if (select_attributes.length > 0){
      var result = _.object(
          select_attributes,
          _.map(select_attributes, function(a) { return _.result(node, a); }) );

        // Remove non-truthy non-numeric values
      result = _.pick(result, function(value) { return _.isNumber(value) || value != false });
      // Map float32 and float64 arrays into standard arrays
      result = _.mapObject(result, function(value) {
          if(value instanceof Float32Array || value instanceof Float64Array) {
            return _.toArray(value);
          }
          else {
            return value;
          }
      });

      return result;
    }
    else
    {
      return null;
    }
  },

  /*@param {*} node A node from your data - you can use text() in the XPath expression to select this value
  * @returns {*} The value of the node
  */
  nodeValue: function(node) {
    return null
  },
};

function MolDoc(mol, schema_options) {

  var schema = new ModelSchema(schema_options);

  return jsel.jsel(mol).schema(_.bindAll(schema, "nodeName", "nodeValue", "attributes", "childNodes"));
};

function nodeToJson( node ) {
  var obj = {};

  var child_groups = _.mapObject(
      _.groupBy( node.childNodes(), function(n) { return n.nodeName(); } ),
      function(nodes, name) {
        return _.map(nodes, nodeToJson);
      });

  var attrs = node.attributes() ? node.attributes().values : {};

  return _.extend(obj, child_groups, attrs); 
};

function docToJson( doc ) {
    if( ! doc.cache ){
      doc.selectAll("//*");
    }

    return nodeToJson(doc);
};

return {
  MolDoc : MolDoc,
  docToJson : docToJson,
  nodeToJson : nodeToJson,
};

});
