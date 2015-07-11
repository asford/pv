define(
    ["pv"],
    function(pv) {

var color = pv.color;
var docmodel = pv.mol.docmodel;

DeclarativeController = function( viewer ) {
  this.viewer = viewer;

  this.model = null; 
  this.model_doc =  null;

  this.views = []
}

DeclarativeController.prototype = {

  set_model : function(model) {
    this.model = model;
    this.model_doc = docmodel.molToDoc(model);

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

      var model_view = this.model_doc.selectView(view_spec.selection);

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
