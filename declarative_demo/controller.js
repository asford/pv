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


  add_view : function(view_spec) {
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

    for(var v = 0; v < this.views.length; v++) {
      var view_spec = this.views[v];

      try {
        var model_view = this.model_doc.selectView(view_spec.selection);

        var view_name = v.toString()

        pv.declarativeView.renderView(
          this.viewer, v.toString(), model_view, view_spec);
      }
      catch(err) {
        console.log("Error rendering view: ", view_spec, err); 
      }
    }
    
    this.viewer.autoZoom();
  },
}

return {
  DeclarativeController : DeclarativeController,
};

});
