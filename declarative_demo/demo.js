
requirejs.config({
  'baseUrl' : 'src' ,
  // uncomment the following commented-out block to test the contatenated, 
  // minified PV version. Grunt needs to be run before for this to work.
  /*
  paths : {
    pv : '/js/bio-pv.min'
  }
  */
});


// on purpose outside of the require block, so we can inspect the viewer object 
// from the JavaScript console.
var viewer;
var controller;

var DeclarativeController;

var add_view;

var pv;
require(['pv', 'mol/mol', 'mol/chain', 'mol/residue', 'mol/atom', "js/jsel.js"], function(PV, mol, chain, residue, atom, _jsel) {

pv = PV;
var io = pv.io;
var viewpoint = pv.viewpoint;
var color = pv.color;

DeclarativeController = function( viewer ) {
  this.viewer = viewer;

  this.model = null; 
  this.model_doc =  null;

  this.views = []
}

var jsel_properties = {
  chain : ["name"],
  residue : ["index",  "insCode",  "isAminoacid",  "isNucleotide",  "name",  "num",  "ss"],
  atom : ["element",  "index",  "isHetatm",  "name",  "occupancy",  "tempFactor", "pos"]
}

DeclarativeController.prototype = {

  set_model : function(model) {
    this.model = model;
    this.model_doc = jsel(model).schema(this.model_schema);

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
    "by_chain" : pv.color.byChain,
    "by_element" : pv.color.byElement,
    "by_ss" : pv.color.bySS,
    "rainbow" : pv.color.rainbow,
    "chainbow" : pv.color.ssSuccession
  },

  build_view_options : function( view_spec ) {
    var options = {};

    if (_.has(view_spec, "color")) {
      if (_.has(this.color_options, view_spec.color)) {
        options["color"] = this.color_options[view_spec.color]();
      }
      else if( _.isString(view_spec.color)) {
        options["color"] = pv.color.uniform(view_spec.color);
      }
      else {
        throw { name : "InvalidView", message : "Invalid view property: 'color'", view_spec : view_spec }
      }
    }

    return options;
  },

  model_schema : {
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
        select_attributes = jsel_properties.chain;
      }
      else if ( node instanceof residue.Residue || node instanceof residue.ResidueView ) {
        select_attributes = jsel_properties.residue;
      }
      else if ( node instanceof atom.Atom || node instanceof atom.AtomView ) {
        select_attributes = jsel_properties.atom;
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
  },
}

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

function node_to_json( node ) {
  var obj = {};

  var child_groups = _.mapObject(
      _.groupBy( node.childNodes(), function(n) { return n.nodeName(); } ),
      function(nodes, name) {
        return _.map(nodes, node_to_json);
      });

  var attrs = node.attributes() ? node.attributes().values : {};

  return _.extend(obj, child_groups, attrs); 
};

function doc_to_json( doc ) {
    if( ! doc.cache ){
      doc.selectAll("//*");
    }

    return node_to_json(doc);
};


function update_view_display( ){
  var view_template = _.template( $("#panel-views-template").html() );
  var view_html = view_template( { views : controller.views } );
  $("#panel-views tbody")[0].innerHTML = view_html;
}

function add_view(view_spec) {
  controller.add_view(view_spec);
  update_view_display();
};

function remove_view(view_index) {
  controller.remove_view(view_index);
  update_view_display();
};

function load(pdb_id) {
  $.ajax({ url : 'pdbs/'+pdb_id+'.pdb', success : function(data) {
    $("#panel-pdb")[0].innerHTML = "<pre><code>" + data + "<code></pre>";
    structure = io.pdb(data);
    controller.set_model( structure );

    $("#panel-object")[0].innerHTML = "<pre><code>" + JSON.stringify(doc_to_json( controller.model_doc ), null, 2) + "<code></pre>";
  }});
}

function ssSuccession() {
  viewer.forEach(function(go) {
    go.colorBy(color.ssSuccession());
  });
  viewer.requestRedraw();
}

function phong() {
  viewer.options('style', 'phong');
  viewer.requestRedraw();
}

function hemilight() {
  viewer.options('style', 'hemilight');
  viewer.requestRedraw();
}

var targets = [
  { pdb_id : "1qys", description : "Top 7" },
  { pdb_id : "1crn", description : "Crambin" },
  { pdb_id : "1ake", description : "Adenylate Kinase" },
  { pdb_id : "1r6a", description : "Methyl Transferase" },
  { pdb_id : "4c46", description : "Long Helices" },
  { pdb_id : "2f8v", description : "Telethonin" },
  { pdb_id : "4ubb", description : "DNA Polymerase" },
]

$(document).foundation();

// Setup load menu
var load_dropdown_template = _.template( $("#load_dropdown_template").html() );
$("#load_dropdown")[0].innerHTML = load_dropdown_template( { targets : targets });

$('#load_dropdown').on("click", "a", function() {
  load( this.getAttribute("pdb_id") );
});

$('#phong').click(phong);
$('#hemilight').click(hemilight);

// View panel form handlers.
var color_options_template = _.template( $("#color_options_template").html() );
$("#color_options")[0].innerHTML = color_options_template( { color_options : _.keys(DeclarativeController.prototype.color_options) });

$("#panel-views").on("click", ".button.add", function() {
  var form = $("#panel-views form");

  var result = form.serializeArray().reduce(function(m,o){ m[o.name] = o.value; return m;}, {});

  // Remove non-truthy values
  result = _.pick(result, _.identity);

  add_view(result);

  form[0].reset();
});

$("#panel-views table").on("click", ".button.delete", function() {
  var target_index = $(this).parents("tr")[0].getAttribute("view_index");
  remove_view(target_index);
});

// Global component initialization
viewer = pv.Viewer(document.getElementById('viewer'), { 
    width : 'auto', height: 'auto', antialias : true, 
    outline : true, quality : 'medium', style : 'hemilight',
    background : '#fff', animateTime: 500, doubleClick : null
});

controller = new DeclarativeController(viewer);
add_view({ selection: "/structure", mode: "cartoon"});

viewer.addListener('viewerReady', function() { load(targets[0].pdb_id); } );

// Viewer event handlers

viewer.on('doubleClick', function(picked) {
  if (picked === null) {
    viewer.fitTo(structure);
     return;
  }
  viewer.setCenter(picked.pos(), 500);
});

viewer.addListener('click', function(picked) {
  if (picked === null) return;
  var target = picked.target();
  if (target.qualifiedName !== undefined) {
    console.log("Clicked: ", picked);
  }
});

window.addEventListener('resize', function() {
      viewer.fitParent();
});

});
