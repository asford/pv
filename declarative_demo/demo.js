
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
var structure;
var structure_doc;

var doc_to_json;
var node_to_json;

var jsel_schema;
var add_to_view;

var pv;
require(['pv', 'mol/mol', 'mol/chain', 'mol/residue', 'mol/atom', "js/jsel.js"], function(PV, mol, chain, residue, atom, _jsel) {

pv = PV;
var io = pv.io;
var viewpoint = pv.viewpoint;
var color = pv.color;

var jsel_properties = {
  chain : ["name"],
  residue : ["index",  "insCode",  "isAminoacid",  "isNucleotide",  "name",  "num",  "ss"],
  atom : ["element",  "index",  "isHetatm",  "name",  "occupancy",  "tempFactor", "pos"]
}

jsel_schema = {
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

add_to_view = function(view, obj) {
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

node_to_json = function( node ) {
  var obj = {};

  var child_groups = _.mapObject(
      _.groupBy( node.childNodes(), function(n) { return n.nodeName(); } ),
      function(nodes, name) {
        return _.map(nodes, node_to_json);
      });

  var attrs = node.attributes() ? node.attributes().values : {};

  return _.extend(obj, child_groups, attrs); 
}

doc_to_json = function(doc) {
  if( ! doc.cache ){
    doc.selectAll("//*");
  }

  return node_to_json(doc);
}

function points() {
  viewer.clear();
  var go = viewer.points('structure', structure, {
                         color: color.byResidueProp('num'),
                         showRelated : '1' });
  go.setSelection(structure.select({ rnumRange : [15,20] }));
}

function lines() {
  viewer.clear();
  var go = viewer.lines('structure', structure, {
              color: color.byResidueProp('num'),
              showRelated : '1' });
  go.setSelection(structure.select({ rnumRange : [15,20] }));
}

function cartoon() {
  viewer.clear();
  var go = viewer.cartoon('structure', structure, {
      color : color.ssSuccession(), showRelated : '1',
  });
  go.setSelection(structure.select({ rnumRange : [15,20] }));
  
  var rotation = viewpoint.principalAxes(go);
  viewer.setRotation(rotation)
}

function lineTrace() {
  viewer.clear();
  var go = viewer.lineTrace('structure', structure, { showRelated : '1' });
  go.setSelection(structure.select({ rnumRange : [15,20] }));
}

function spheres() {
  viewer.clear();
  var go = viewer.spheres('structure', structure, { showRelated : '1' });
  go.setSelection(structure.select({ rnumRange : [15,20] }));
}

function sline() {
  viewer.clear();
  var go = viewer.sline('structure', structure,
          { color : color.uniform('red'), showRelated : '1'});
  go.setSelection(structure.select({ rnumRange : [15,20] }));
}

function tube() {
  viewer.clear();
  var go = viewer.tube('structure', structure);
  viewer.lines('structure.ca', structure.select({aname :'CA'}),
            { color: color.uniform('blue'), lineWidth : 1,
              showRelated : '1' });
  go.setSelection(structure.select({ rnumRange : [15,20] }));
}

function trace() {
  viewer.clear();
  var go = viewer.trace('structure', structure, { showRelated : '1' });
  go.setSelection(structure.select({ rnumRange : [15,20] }));

}
function ballsAndSticks() {
  viewer.clear();
  var go = viewer.ballsAndSticks('structure', structure, { showRelated : '1' });
  go.setSelection(structure.select({ rnumRange : [15,20] }));
}

function preset() {
  viewer.clear();
  var ligand = structure.select({'rnames' : ['SAH', 'RVP']});
  viewer.ballsAndSticks('structure.ligand', ligand, {
  });
  viewer.cartoon('structure.protein', structure, { boundingSpheres: false });
}

function load(pdb_id) {
  $.ajax({ url : 'pdbs/'+pdb_id+'.pdb', success : function(data) {
    $("#panel-pdb")[0].innerHTML = "<pre><code>" + data + "<code></pre>";
    structure = io.pdb(data);
    structure_doc = jsel(structure).schema(jsel_schema);
    $("#panel-object")[0].innerHTML = "<pre><code>" + JSON.stringify(doc_to_json(structure_doc), null, 2) + "<code></pre>";
    //mol.assignHelixSheet(structure);
    cartoon();
    viewer.autoZoom();
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

function uniform() {
  viewer.forEach(function(go) {
    go.colorBy(color.uniform([0,1,0]));
  });
  viewer.requestRedraw();
}
function byElement() {
  viewer.forEach(function(go) {
    go.colorBy(color.byElement());
  });
  viewer.requestRedraw();
}

function ss() {
  viewer.forEach(function(go) {
    go.colorBy(color.bySS());
  });
  viewer.requestRedraw();
}

function proInRed() {
  viewer.forEach(function(go) {
    go.colorBy(color.uniform('red'), go.select({rname : 'PRO'}));
  });
  viewer.requestRedraw();
}
function rainbow() {
  viewer.forEach(function(go) {
    go.colorBy(color.rainbow());
  });
  viewer.requestRedraw();
}

function byChain() {
  viewer.forEach(function(go) {
    go.colorBy(color.byChain());
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

function ensemble() {
  io.fetchPdb('/pdbs/1nmr.pdb', function(structures) {
    viewer.clear()
    structure = structures[i];
    for (var i = 0; i < structures.length; ++i) {
      go = viewer.cartoon('ensemble_'+ i, structures[i]);
    }
    viewer.autoZoom();
  }, { loadAllModels : true } );
}
$(document).foundation();
$('#1r6a').click(transferase);
$('#1crn').click(crambin);
$('#1ake').click(kinase);
$('#4ubb').click(polymerase);
$('#4c46').click(longHelices);
$('#2f8v').click(telethonin);
$('#ensemble').click(ensemble);
$('#style-cartoon').click(cartoon);
$('#style-tube').click(tube);
$('#style-line-trace').click(lineTrace);
$('#style-sline').click(sline);
$('#style-trace').click(trace);
$('#style-lines').click(lines);
$('#style-balls-and-sticks').click(ballsAndSticks);
$('#style-points').click(points);
$('#style-spheres').click(spheres);
$('#color-uniform').click(uniform);
$('#color-element').click(byElement);
$('#color-chain').click(byChain);
$('#color-ss-succ').click(ssSuccession);
$('#color-ss').click(ss);
$('#phong').click(phong);
$('#hemilight').click(hemilight);
$('#color-rainbow').click(rainbow);
$('#load-from-pdb').change(function() {
  var pdbId = this.value;
  this.value = '';
  this.blur();
  var url = 'http://www.rcsb.org/pdb/files/' + pdbId + '.pdb';
  console.log(url);

  io.fetchPdb(url, function(s) {
    structure = s;
    cartoon();
    viewer.autoZoom();
  });
});
viewer = pv.Viewer(document.getElementById('viewer'), { 
    width : 'auto', height: 'auto', antialias : true, 
    outline : true, quality : 'medium', style : 'hemilight',
    background : '#fff', animateTime: 500, doubleClick : null
});
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

});
