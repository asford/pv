/* jshint maxlen: 130 */
define(
    [
      'extern/underscore',
      'extern/jsel',
      'mol/mol',
      'mol/chain',
      'mol/residue',
      'mol/atom'],
    function(_, jsel, mol, chain, residue, atom) {

"use strict";

function get_chain_view(mol_view, target_chain) {
  var view_chains = mol_view.chains();

  for (var c = 0, len = view_chains.length; c < len; c++) {
    if (view_chains[c]._chain === target_chain) {
      return view_chains[c];
    }
  }
  
  return null;
}

function get_residue_view(chain_view, target_residue) {
  var view_residues = chain_view.residues();

  for (var r = 0, len = view_residues.length; r < len; r++) {
    if (view_residues[r]._residue === target_residue) {
      return view_residues[r];
    }
  }

  return null;
}

function add_to_view(view, obj) {
  if ( obj instanceof Array){
    _.reduce(obj, add_to_view, view);
  }

  var chain_view;
  var residue_view;
  if ( obj instanceof mol.Mol || obj instanceof mol.MolView ) {
    if (view._mol !== obj ){
      console.log("Mismatch adding Mol to MolView.", view, obj);
      return view;
    }

    obj.chains().forEach(function(c) { view.addChain(c, true) ;} );
  }
  else if ( obj instanceof chain.Chain || obj instanceof chain.ChainView ) {
    if (view._mol !== obj._structure ){
      console.log("Mol mismatch adding Chain to MolView.", view, obj);
      return view;
    }

    chain_view = get_chain_view(view, obj);
    if( ! chain_view ){
      view.addChain(obj, true);
    }
  }
  else if ( obj instanceof residue.Residue || obj instanceof residue.ResidueView ) {
    if ( view._mol !== obj._chain._structure ){
      console.log("Mol mismatch adding Residue to MolView.", view, obj);
      return view;
    }

    chain_view = get_chain_view(view, obj._chain);
    if( ! chain_view ){
      chain_view = view.addChain(obj._chain, false);
    }

    chain_view.addResidue( obj, true);
  }
  else if ( obj instanceof atom.Atom || obj instanceof atom.AtomView ) {
    if ( view._mol !== obj._residue._chain._structure ){
      console.log("Mol mismatch adding Atom to MolView.", view, obj);
      return view;
    }

    chain_view = get_chain_view(view, obj._residue._chain);
    if( ! chain_view ){
      chain_view = view.addChain(obj._residue._chain, false);
    }

    residue_view = get_residue_view(chain_view, obj._residue);
    if( ! residue_view ){
      residue_view = chain_view.addResidue(obj._residue, false);
    }

    residue_view.addAtom( obj );
  }
  return view;
}

var ModelSchema = function( schema_options ) {
  this.includeCore = true;
  this.includeExtended = true;

  _.extendOwn( this, _.pick(schema_options, "includeCore", "includeExtended") );
};

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
      this.core_properties[node_type].forEach(
        function(v) { select_attributes.push(v); } );
    }

    if ( this.includeExtended ) {
      this.extended_properties[node_type].forEach(
        function(v) { select_attributes.push(v); } );
    }

    if (select_attributes.length > 0){
      var result = _.object(
          select_attributes,
          _.map(select_attributes, function(a) { return _.result(node, a); }) );

        // Remove non-truthy non-numeric values
      result = _.pick(result, function(value) { return _.isNumber(value) || value; });
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
  nodeValue: function() {
    return null;
  },
};

function selectView(molDoc, mol, selection_xpath) {
  var result = molDoc.selectAll( selection_xpath );
  if(! _.isEmpty(result) ) {
    return add_to_view(mol.createEmptyView(), result);
  }
}

function molToDoc(mol, schema_options) {

  var schema = new ModelSchema(schema_options);

  var mol_doc = jsel.jsel(mol).schema(_.bindAll(schema, "nodeName", "nodeValue", "attributes", "childNodes"));
  mol_doc.selectView = _.partial(selectView, mol_doc, mol);

  return mol_doc;
}

function nodeToObj( node ) {
  var obj = {};

  var child_groups = _.mapObject(
      _.groupBy( node.childNodes(), function(n) { return n.nodeName(); } ),
      function(nodes) {
        return _.map(nodes, nodeToObj);
      });

  var attrs = node.attributes() ? node.attributes().values : {};

  return _.extend(obj, child_groups, attrs); 
}

function docToObj( doc ) {
    if( ! doc.cache ){
      doc.selectAll("//*");
    }

    return nodeToObj(doc);
}

function objToMol( obj ) {
  if( _.has(obj, "structure") ) {
    if (_.isArray(obj.structure)) {
      return objToMol(obj.structure[0]);
    } else {
      return objToMol(obj.structure);
    }
  }

  var structure = new mol.Mol();

  for (var ci = 0; ci < obj.chain.length; ci++){
    var chain_obj = obj.chain[ci];
    var chain = structure.addChain( chain_obj.name );

    _.extend(chain, 
      _.omit(chain_obj,
              ModelSchema.prototype.core_properties.chain,
              ModelSchema.prototype.extended_properties.chain,
              "residue"));

    for (var ri = 0; ri < chain_obj.residue.length; ri++) {
      var res_obj = chain_obj.residue[ri];
      var residue = chain.addResidue(res_obj.name, res_obj.number, res_obj.insCode);

      _.extend(residue,
        _.omit(res_obj,
                ModelSchema.prototype.core_properties.residue,
                ModelSchema.prototype.extended_properties.residue,
                "atom"));

      for (var ai = 0; ai < res_obj.atom.length; ai++) {
        var atom_obj = res_obj.atom[ai];
        var atom = residue.addAtom(
          atom_obj.name, atom_obj.pos, atom_obj.element, atom_obj.isHetatm, atom_obj.occupancy, atom_obj.tempFactor
        );

        _.extend(atom,
          _.omit(atom_obj,
                  ModelSchema.prototype.core_properties.atom,
                  ModelSchema.prototype.extended_properties.atom ));
      }
    }
  }

  structure.deriveConnectivity();
  return structure;
}

return {
  ModelSchema: ModelSchema,
  molToDoc : molToDoc,
  docToObj : docToObj,
  objToMol : objToMol,
};

});
