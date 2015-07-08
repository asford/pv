
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

  add_view : function(selection, mode) {

    var view_spec = { selection : selection, mode : mode };
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
      var model_view = add_to_view(
          this.model.createEmptyView(),
          this.model_doc.selectAll( this.views[v].selection));

      this.viewer.renderAs( "model." + this.views[v].mode, model_view, this.views[v].mode );
    }
    
    this.viewer.autoZoom();
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

function add_view(selector, mode) {
  controller.add_view(selector, mode);
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
function kinase() {
  load('1ake');
}

function crambin() {
  load('1crn');
}

function transferase() {
  load('1r6a');
}

function telethonin() { load('2f8v'); }

function porin() {
  load('2por');
}
function longHelices() {
  load('4C46');
}

function ssSuccession() {
  viewer.forEach(function(go) {
    go.colorBy(color.ssSuccession());
  });
  viewer.requestRedraw();
}

function polymerase() {
  load('4UBB');
};


function phong() {
  viewer.options('style', 'phong');
  viewer.requestRedraw();
}

function hemilight() {
  viewer.options('style', 'hemilight');
  viewer.requestRedraw();
}


function cross() {
  viewer.clear();
  var go = viewer.customMesh('custom');

  go.addSphere([-10, 0, 0], 2, { userData : 'one' } );
  go.addSphere([10, 0, 0], 2, { userData : 'two' } );
  go.addSphere([0, -10, 0], 2, { userData : 'three' } );
  go.addSphere([0, 10, 0], 2, { userData : 'four' } );
  go.addSphere([0, 0, -10], 2, { userData : 'five' } );
  go.addSphere([0, 0, 10], 2, { userData : 'six' } );
  viewer.setCenter([0,0,0], 2, { userData : 'seven' } );
  viewer.setZoom(20);
}

$(document).foundation();
$('#1r6a').click(transferase);
$('#1crn').click(crambin);
$('#1ake').click(kinase);
$('#4ubb').click(polymerase);
$('#4c46').click(longHelices);
$('#2f8v').click(telethonin);
$('#phong').click(phong);
$('#hemilight').click(hemilight);

viewer = pv.Viewer(document.getElementById('viewer'), { 
    width : 'auto', height: 'auto', antialias : true, 
    outline : true, quality : 'medium', style : 'hemilight',
    background : '#fff', animateTime: 500, doubleClick : null
});

controller = new DeclarativeController(viewer);
add_view("/structure", "cartoon");


viewer.addListener('viewerReady', crambin);

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
    console.log('clicked atom', target.qualifiedName(), 'on object',
                picked.node().name());
  }
});

window.addEventListener('resize', function() {
      viewer.fitParent();
});

$("#panel-views").on("click", ".button.add", function() {
  var form = $("#panel-views form");

  var result = form.serializeArray().reduce(function(m,o){ m[o.name] = o.value; return m;}, {});
  add_view(result.selector, result.mode);

  form[0].reset();
});

$("#panel-views table").on("click", ".button.delete", function() {
  var target_index = $(this).parents("tr")[0].getAttribute("view_index");
  remove_view(target_index);
});

});
