define(
    ['extern/underscore', 'color', 'mol/mol', 'mol/chain', 'mol/residue', 'mol/atom', 'mol/docmodel'],
    function(_, color, mol, chain, residue, atom, docmodel) {

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
    if ( obj instanceof mol.Mol || obj instanceof mol.MolView ) {
      if (! view._mol === obj ){
        console.log("Mismatch adding Mol to MolView.", view, obj);
        return view;
      }

      obj.chains().forEach(function(c) { view.addChain(c, true) ;} );
    }
    else if ( obj instanceof chain.Chain || obj instanceof chain.ChainView ) {
      if (! view._mol === obj._structure ){
        console.log("Mol mismatch adding Chain to MolView.", view, obj);
        return view;
      }

      var chain_view = get_chain_view(view, obj);
      if( ! chain_view ){
        view.addChain(obj, true);
      }
    }
    else if ( obj instanceof residue.Residue || obj instanceof residue.ResidueView ) {
      if (! view._mol === obj._chain._structure ){
        console.log("Mol mismatch adding Residue to MolView.", view, obj);
        return view;
      }

      var chain_view = get_chain_view(view, obj._chain);
      if( ! chain_view ){
        chain_view = view.addChain(obj._chain, false);
      }

      chain_view.addResidue( obj, true);
    }
    else if ( obj instanceof atom.Atom || obj instanceof atom.AtomView ) {
      if (! view._mol === obj._residue._chain._structure ){
        console.log("Mol mismatch adding Atom to MolView.", view, obj);
        return view;
      }

      var chain_view = get_chain_view(view, obj._residue._chain);
      if( ! chain_view ){
        chain_view = view.addChain(obj._residue._chain, false);
      }

      var residue_view = get_residue_view(chain_view, obj._residue);
      if( ! residue_view ){
        residue_view = chain_view.addResidue(obj._residue, false);
      }

      residue_view.addAtom( obj );
    }
    return view;
  }

DeclarativeController = function( viewer ) {
  this.viewer = viewer;

  this.model = null; 
  this.model_doc =  null;

  this.views = []
}


DeclarativeController.prototype = {

  set_model : function(model) {
    this.model = model;
    this.model_doc = docmodel.MolDoc(model, {includeExtended: true});

    this.setup_views();

    return this;
  },

  validate_view : function(view_spec) {
    return;
  },

  add_view : function(view_spec) {
    this.validate_view(view_spec);
    this.views.push( view_spec );

    this.setup_views();

    return this;
  },

  remove_view : function(view_index) {

    this.views.splice( view_index, 1);

    this.setup_views();

    return this;
  },

  setup_views : function() {
    this.viewer.clear();

    if(! this.model ) { return; }

    for(v = 0; v < this.views.length; v++) {
      var color_options = this.color_options;

      var view_spec = this.views[v];

      var model_view = add_to_view(
          this.model.createEmptyView(),
          this.model_doc.selectAll( view_spec.selection));

      this.viewer.renderAs(
          "model." + view_spec.mode,
          model_view,
          view_spec.mode,
          this.build_view_options( view_spec ));
    }
    
    this.viewer.autoZoom();
  },

  color_options : {
    "by_chain" : color.byChain,
    "by_element" : color.byElement,
    "by_ss" : color.bySS,
    "rainbow" : color.rainbow,
    "chainbow" : color.ssSuccession
  },

  build_view_options : function( view_spec ) {
    var options = {};

    if (_.has(view_spec, "color")) {
      if (_.has(this.color_options, view_spec.color)) {
        options["color"] = this.color_options[view_spec.color]();
      }
      else if( _.isString(view_spec.color)) {
        options["color"] = color.uniform(view_spec.color);
      }
      else {
        throw { name : "InvalidView", message : "Invalid view property: 'color'", view_spec : view_spec }
      }
    }

    return options;
  },
}

return {
  DeclarativeController : DeclarativeController,
};

});
