
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
var pv;
var jsel;

require(['pv', "extern/jsel", 'mol/mol', 'mol/chain', 'mol/residue', 'mol/atom', "mol/docmodel", "declarative-controller"], function(PV, JSEL, mol, chain, residue, atom, docmodel, dec_con) {

pv = PV;
jsel = JSEL;
var io = pv.io;
var viewpoint = pv.viewpoint;
var color = pv.color;
var DeclarativeController = dec_con.DeclarativeController;

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

    $("#panel-object")[0].innerHTML = "<pre><code>" + JSON.stringify(docmodel.docToObj( controller.model_doc ), null, 2) + "<code></pre>";
  }});
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
add_view({ selection: "//structure", mode: "cartoon"});

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
