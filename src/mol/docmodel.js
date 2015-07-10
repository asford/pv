define(
    ['extern/underscore', 'extern/jsel', 'mol/mol', 'mol/chain', 'mol/residue', 'mol/atom'],
    function(_, jsel, mol, chain, residue, atom) {

var node_properties = {
  chain : ["name"],
  residue : ["index",  "insCode",  "isAminoacid",  "isNucleotide",  "name",  "num",  "ss"],
  atom : ["element",  "index",  "isHetatm",  "name",  "occupancy",  "tempFactor", "pos"]
};

var model_schema = {

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

  /*@param {*} node A node from your data
  * @returns {Array} The children of the node
  */
  childNodes: function(node) {
    if ( node instanceof mol.Mol || node instanceof mol.MolView ) {
      return node.chains();
    }
    else if ( node instanceof chain.Chain || node instanceof chain.ChainView ) {
      return node.residues();
    }
    else if ( node instanceof residue.Residue || node instanceof residue.ResidueView ) {
      return node.atoms();
    }
    else if ( node instanceof atom.Atom || node instanceof atom.AtomView ) {
      return null;
    }
    else {
      return null;
    }
  },

  /*@param {*} node A node from your data
  * @returns {Object} A key/value object of the node's attributes
  */
  attributes: function(node) {
    var select_attributes = null;

    if ( node instanceof mol.Mol || node instanceof mol.MolView ) {
      select_attributes = null;
    }
    else if ( node instanceof chain.Chain || node instanceof chain.ChainView ) {
      select_attributes = node_properties.chain;
    }
    else if ( node instanceof residue.Residue || node instanceof residue.ResidueView ) {
      select_attributes = node_properties.residue;
    }
    else if ( node instanceof atom.Atom || node instanceof atom.AtomView ) {
      select_attributes = node_properties.atom;
    }

    if (select_attributes){
      var result = {};

      for (var i = 0, len = select_attributes.length; i < len; i++) {
        result[ select_attributes[i] ] = node["_" + select_attributes[i]];
      }

      return _.pick(result, function(value) { return _.isNumber(value) || value != false })
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

function MolDoc(mol) {
  return jsel.jsel(mol).schema(model_schema);
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
