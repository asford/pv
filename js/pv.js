"use strict";

var gl;
var last_mouse_pos;
function get_element_contents(element) {
  var contents = '';
  var k = element.firstChild;
  while (k) {
    if (k.nodeType == 3) {
      contents += k.textContent;
    }
    k = k.nextSibling;
  }
  return contents;
}

var ortho_vec = (function() {
  var tmp = vec3.create();
  return function(out, vec) {
    vec3.copy(tmp, vec);
    if (Math.abs(vec[0]) < Math.abs(vec[1])) {
      if (Math.abs(vec[0]) < Math.abs(vec[2])) {
        tmp[0] += 1
      } else {
        tmp[2] += 1;
      }
    } else {
      if (Math.abs(vec[1]) < Math.abs(vec[2])) {
        tmp[1] += 1;
      } else {
        tmp[2] += 1;
      }
    }
    return vec3.cross(out, vec, tmp);
  };
})();


// assumes that axis is normalized. don't expect 
// to get meaningful results if it's not
mat3.axisRotation = function(out, axis, angle) {

  var sa = Math.sin(angle);
  var ca = Math.cos(angle);

  var x = axis[0];
  var y = axis[1];
  var z = axis[2];
  var xx = x*x;
  var xy = x*y;
  var xz = x*z;
  var yy = y*y;
  var yz = y*z;
  var zz =z*z;


  out[0] = xx+ca-xx*ca;
  out[1] = xy-ca*xy-sa*z;
  out[2] = xz-ca*xz+sa*y;
  out[3] = xy-ca*xy+sa*z;
  out[4] = yy+ca-ca*yy;
  out[5] = yz-ca*yz-sa*x;
  out[6] = xz-ca*xz-sa*y;
  out[7] = yz-ca*yz+sa*x;
  out[8] = zz+ca-ca*zz;
  return out;
}


var inplace_smooth = (function() {
  var bf = vec3.create();
  var af = vec3.create();
  var smooth_factor = 0.5;
  return function(positions, from, to) {
    vec3.set(bf, positions[3*from+0], positions[3*from+1], positions[3*from+2]);
    for (var i = from; i < to; ++i) {
      vec3.set(af, positions[3*i+0], positions[3*i+1], positions[3*i+2]);
      positions[3*i+0] = af[0]*smooth_factor + bf[0]*(1.0 - smooth_factor);
      positions[3*i+1] = af[1]*smooth_factor + bf[1]*(1.0 - smooth_factor);
      positions[3*i+2] = af[2]*smooth_factor + bf[2]*(1.0 - smooth_factor);
      vec3.copy(bf, af);
    }
  }
})();

// calculates intermediate normals on the smooth tube (or ribbon) from
// residues normals given for each residue. the interpolated normals
// are obtained by "rotating" the normal of the previous residue onto
// the normal of the next residue. consecutive normals are flipped when
// the angle between them is larger than 180 degrees.
function interpolate_normals(normals, num) {
  var out = new Float32Array((normals.length-3)*num);
  var index = 0;
  var m = mat3.create();
  var bf = vec3.create(), af = vec3.create();
  var cross = vec3.create();
  var delta = 1/num;
  vec3.set(bf, normals[3*i+0], normals[3*i+1], normals[3*i+2]);
  for (var i = 0, e = normals.length/3-1;  i < e; ++i) {
    vec3.set(af, normals[3*i+3], normals[3*i+4], normals[3*i+5]);
    if (vec3.dot(af, bf) < 0) {
      vec3.negate(af, af);
    }
    var delta_angle = vec3.dot(af, bf)/num;
    vec3.cross(cross, af, bf);
    mat3.axisRotation(m, cross, delta_angle);

    for (var j = 0; j < num; ++j) {
      var t = delta * j;
      vec3.transformMat3(bf, bf, m);
      out[index+0] = bf[0];
      out[index+1] = bf[1];
      out[index+2] = bf[2];
      index+=3;
    }
    vec3.copy(bf, af);
  }
  out[index+0] = af[0];
  out[index+1] = af[1];
  out[index+2] = af[2];
  return out;
}

function interpolate_color(colors, num) {
  var out = new Float32Array((colors.length-3)*num);
  var index = 0;
  var bf = vec3.create(), af = vec3.create();
  var delta = 1/num;
  for (var i = 0; i < colors.length/3-1; ++i) {
    vec3.set(bf, colors[3*i+0], colors[3*i+1], colors[3*i+2]);
    vec3.set(af, colors[3*i+3], colors[3*i+4], colors[3*i+5]);
    for (var j = 0; j < num; ++j) {
      var t = delta * j;
      out[index+0] = bf[0]*(1-t)+af[0]*t;
      out[index+1] = bf[1]*(1-t)+af[1]*t;
      out[index+2] = bf[2]*(1-t)+af[2]*t;
      index+=3;
    }
  }
  out[index+0] = af[0];
  out[index+1] = af[1];
  out[index+2] = af[2];
  return out;
}

function even_odd(even, odd) {
  return function(atom, out, index) {
    if (atom.residue().num() % 2) {
      out[index+0] = even[0];
      out[index+1] = even[1];
      out[index+2] = even[2];
    } else {
      out[index+0] = odd[0];
      out[index+1] = odd[1];
      out[index+2] = odd[2];
    }
  }
}


function ss() {
  return function(atom, out, index) {
    switch (atom.residue().ss()) {
      case 'C':
        out[index+0] = 0.8;
        out[index+1] = 0.8;
        out[index+2] = 0.8;
        return;
      case 'H':
        out[index+0] = 1.0;
        out[index+1] = 0.0;
        out[index+2] = 0.0;
        return;
      case 'E':
        out[index+0] = 0.0;
        out[index+1] = 1.0;
        out[index+2] = 0.0;
        return;
    }
  }
}


function uniform_color(color) {
  return function(atom, out, index) {
    out[index+0] = color[0];
    out[index+1] = color[1];
    out[index+2] = color[2];
  }
}


function MolBase() {

};

function Mol() {
}

function MolView(mol) {
 this._mol = mol; 
 this._chains = [];
}


MolView.prototype = new MolBase();


function ChainBase() {
}

ChainBase.prototype.each_atom = function(callback) {
  for (var i = 0; i< this._residues.length; i+=1) {
    this._residues[i].each_atom(callback);
  }
}
ChainBase.prototype.each_residue = function(callback) {
  for (var i = 0; i < this._residues.length; i+=1) {
    callback(this._residues[i]);
  }
}

ChainBase.prototype.residues = function() { return this._residues; }
ChainBase.prototype.structure = function() { return this._structure; }

// invokes a callback for each connected stretch of amino acids. these stretches are used 
// for all trace-based rendering styles, e.g. sline, line_trace, tube, cartoon etc. 
ChainBase.prototype.each_backbone_trace = function(callback) {
  var  stretch = [];
  for (var i = 0; i < this._residues.length; i+=1) {
    var residue = this._residues[i];
    if (!residue.is_aminoacid()) {
      if (stretch.length > 1) {
        callback(stretch);
        stretch = [];
      }
      continue;
    }
    if (stretch.length == 0) {
      stretch.push(residue);
      continue;
    }
    var ca_prev = this._residues[i-1].atom('C');
    var n_this = residue.atom('N');
    if (Math.abs(vec3.sqrDist(ca_prev.pos(), n_this.pos()) - 1.5*1.5) < 1) {
      stretch.push(residue);
    } else {
      if (stretch.length > 1) {
        callback(stretch);
        stretch = [];
      }
    }
  }
  if (stretch.length > 1) {
    callback(stretch);
  }
}

function ChainView(mol_view, chain) {
  this._chain = chain;
  this._residues = [];
  this._mol_view = mol_view;

}


ChainView.prototype = new ChainBase();

ChainView.prototype.add_residue = function(residue, recurse) {
  var res_view = new ResidueView(this, residue);
  this._residues.push(res_view);
  if (recurse) {
    var atoms = residue.atoms();
    for (var i = 0; i < atoms.length; ++i) {
      res_view.add_atom(atoms[i]);
    }
  }
  return res_view;
}


function ResidueBase() {

}

ResidueBase.prototype.is_water = function() {
  return this.name() == 'HOH' || this.name() == 'DOD';
}

ResidueBase.prototype.each_atom = function(callback) {
  for (var i =0; i< this._atoms.length; i+=1) {
    callback(this._atoms[i]);
  }
}
ResidueBase.prototype.atom = function(index_or_name) { 
  if (typeof index_or_name == 'string') {
    for (var i =0; i < this._atoms.length; ++i) {
     if (this._atoms[i].name() == index_or_name) {
       return this._atoms[i];
     }
    }
  }
  return this._atoms[index_or_name]; 
}


ResidueBase.prototype.is_aminoacid = function() { 
  return this.atom('N') && this.atom('CA') && this.atom('C') && this.atom('O');
}



function ResidueView(chain_view, residue) {
  this._chain_view = chain_view;
  this._atoms = [];
  this._residue = residue;
}

ResidueView.prototype = new ResidueBase();

ResidueView.prototype.add_atom = function(atom) {
  var atom_view = new AtomView(this, atom);
  this._atoms.push(atom_view);
}
function AtomView(res_view, atom) {
  this._res_view = res_view;
  this._atom = atom;
  this._bonds = [];
}


AtomView.prototype = new AtomBase();
AtomView.prototype.name = function() { return this._atom.name(); }
AtomView.prototype.pos = function() { return this._atom.pos(); }
AtomView.prototype.element = function() { return this._atom.element(); }
AtomView.prototype.bonds = function() { return this._bonds; }


function Chain(structure, name) {
  this._structure = structure;
  this._name = name;
  this._residues = [];
}



Chain.prototype = new ChainBase();

Chain.prototype.name = function() { return this._name; }

Chain.prototype.add_residue = function(name, num) {
  var residue = new Residue(this, name, num);
  this._residues.push(residue);
  return residue;
}

// assigns secondary structure to residues in range from_num to to_num.
Chain.prototype.assign_ss = function(from_num, to_num, ss) {
  // FIXME: when the chain numbers are completely ordered, perform binary search 
  // to identify range of residues to assign secondary structure to.
  for (var i = 0; i < this._residues.length; ++i) {
    var res = this._residues[i];
    // FIXME: we currently don't set the secondary structure of the first and 
    // last residue of helices and sheets. that takes care of better 
    // transitions between coils and helices. ideally, this should be done
    // in the cartoon renderer, NOT in this function.
    if (res.num() <=  from_num || res.num() >= to_num) {
      continue;
    }
    res.set_ss(ss);
  }
},


ChainView.prototype.name = function () { return this._chain.name(); }

function color_for_element(ele, out) {
  if (!out) {
    out = vec4.create();
  }
  if (ele == 'C') {
    vec4.set(out, 0.5,0.5, 0.5, 1.0);
    return out;
  }
  if (ele == 'N') {
    vec4.set(out, 0, 0, 1, 1);
    return out;
  }
  if (ele == 'O') {
    vec4.set(out, 1, 0, 0, 1);
    return out;
  }
  if (ele == 'S') {
    vec4.set(out, 1, 1, 0, 1);
    return out;
  }
  vec4.set(out, 1, 0, 1, 1);
  return out;
}

function cpk_color() {
  return function(atom, out, index) {
    color_for_element(atom.element(), out);
  }
}


var cubic_hermite_interpolate = (function() {
  var p = vec3.create();
  return function (out, p_k, m_k, p_kp1, m_kp1, t, index) {
    var tt = t*t;
    var three_minus_two_t = 3.0 - 2.0*t;
    var h01 = tt*three_minus_two_t;
    var h00 = 1.0 - h01;
    var h10 = tt*(t - 2.0)+t;
    var h11 = tt*(t - 1.0);
    vec3.copy(p, p_k);
    vec3.scale(p, p, h00);
    vec3.scaleAndAdd(p, p, m_k, h10);
    vec3.scaleAndAdd(p, p, p_kp1, h01);
    vec3.scaleAndAdd(p, p, m_kp1, h11);
    out[index+0] = p[0];
    out[index+1] = p[1];
    out[index+2] = p[2];
}
})();


// interpolates the given list of points (stored in a Float32Array) with a Cubic 
// Hermite spline using the method of Catmull and Rom to calculate the tangents.
function catmull_rom_spline(points, num, strength, circular) {
  circular = circular || false;
  strength = strength || 0.5;
  if (circular) {
    var out = new Float32Array(points.length*num);
  } else {
    var out = new Float32Array((points.length-3)*num);
  }
  var index = 0;
  var delta_t = 1.0/num;
  var m_k = vec3.create(), m_kp1 = vec3.create(); // tangents at k-1 and k+1
  var p_k = vec3.create(), p_kp1 = vec3.create(), 
      p_kp2 = vec3.create(), p_kp3 = vec3.create(); 

  vec3.set(p_kp1, points[0], points[1], points[2]);
  vec3.set(p_kp2, points[3], points[4], points[5]);
  if (circular) {
    vec3.set(p_k,  points[points.length-3], points[points.length-2], 
             points[points.length-1]);
    vec3.sub(m_k, p_kp2, p_k);
    vec3.scale(m_k, m_k, strength);
  } else {
    vec3.set(p_k,   points[0], points[1], points[2]);
    vec3.set(m_k, 0, 0, 0);
  }
  for (var i = 1, e = points.length/3-1; i < e; ++i) {
    vec3.set(p_kp3, points[3*(i+1)+0], points[3*(i+1)+1], points[3*(i+1)+2]);
    vec3.sub(m_kp1, p_kp3, p_kp1);
    vec3.scale(m_kp1, m_kp1, strength);
    for (var j = 0; j < num; ++j) {
      var t = delta_t*j;
      cubic_hermite_interpolate(out, p_kp1, m_k, p_kp2, m_kp1, t, index);
      index+=3;
    }
    vec3.copy(p_k, p_kp1);
    vec3.copy(p_kp1, p_kp2);
    vec3.copy(p_kp2, p_kp3);
    vec3.copy(m_k, m_kp1);
  }
  if (circular) {
    vec3.set(p_kp3, points[0], points[1], points[3]);
    vec3.sub(m_kp1, p_kp3, p_kp1);
    vec3.scale(m_kp1, m_kp1, strength);
  } else {
    vec3.set(m_kp1, 0, 0, 0);
  }
  for (var j = 0; j < num; ++j) {
    var t = delta_t*j;
    cubic_hermite_interpolate(out, p_kp1, m_k, p_kp2, m_kp1, t, index);
    index+=3;
  }
  if (!circular) {
    out[index+0] = points[points.length-3];
    out[index+1] = points[points.length-2];
    out[index+2] = points[points.length-1];
    return out;
  }
  vec3.copy(p_k, p_kp1);
  vec3.copy(p_kp1, p_kp2);
  vec3.copy(p_kp2, p_kp3);
  vec3.copy(m_k, m_kp1);
  vec3.set(p_kp3, points[3], points[4], points[5]);
  vec3.sub(m_kp1, p_kp3, p_kp1);
  vec3.scale(m_kp1, m_kp1, strength);
  for (var j = 0; j < num; ++j) {
    var t = delta_t*j;
    cubic_hermite_interpolate(out, p_kp1, m_k, p_kp2, m_kp1, t, index);
    index+=3;
  }
  return out;
}


var LineGeom = function() {
  var self = {
    data : [],
    ready : false,
    interleaved_buffer : gl.createBuffer(),
    num_lines : 0,
  };

  return {
    draw : function(shader_program) {
      this.bind();
      var vert_attrib = gl.getAttribLocation(shader_program, 'attr_pos');
      gl.enableVertexAttribArray(vert_attrib);
      gl.vertexAttribPointer(vert_attrib, 3, gl.FLOAT, false, 6*4, 0*4);
      var clr_attrib = gl.getAttribLocation(shader_program, 'attr_color');
      gl.vertexAttribPointer(clr_attrib, 3, gl.FLOAT, false, 6*4, 3*4);
      gl.enableVertexAttribArray(clr_attrib);
      gl.drawArrays(gl.LINES, 0, self.num_lines*2);
      gl.disableVertexAttribArray(vert_attrib);
      gl.disableVertexAttribArray(clr_attrib);
    },

    // prepare data for rendering. if the buffer data was modified, this synchronizes 
    // the corresponding GL array buffers.
    bind : function() {
      gl.bindBuffer(gl.ARRAY_BUFFER, self.interleaved_buffer);
      if (!self.ready) {
        var float_array = new Float32Array(self.data);
        gl.bufferData(gl.ARRAY_BUFFER, float_array, gl.STATIC_DRAW);
        self.ready = true;
        // clear original data. it's not used anymore
        self.data = []
      }
    },
    add_line : function(start_pos, start_color, end_pos, end_color) {
     self.data.push(start_pos[0]); 
     self.data.push(start_pos[1]); 
     self.data.push(start_pos[2]); 
     self.data.push(start_color[0]);
     self.data.push(start_color[1]);
     self.data.push(start_color[2]);

     self.data.push(end_pos[0]); 
     self.data.push(end_pos[1]); 
     self.data.push(end_pos[2]); 
     self.data.push(end_color[0]);
     self.data.push(end_color[1]);
     self.data.push(end_color[2]);
     self.num_lines += 1;
     self.ready = false;
    }
  };
};

var ProtoSphere  = function(stacks, arcs) {
  var self = {
    arcs : arcs,
    stacks : stacks,
    indices : new Uint16Array(3*arcs*stacks*2),
    verts : new Float32Array(3*arcs*stacks),
  };
  var vert_angle = Math.PI/(stacks-1);
  var horz_angle = Math.PI*2.0/arcs;
  for (var i = 0; i < self.stacks; ++i) {
    var radius = Math.sin(i*vert_angle);
    var z = Math.cos(i*vert_angle);
    for (var j = 0; j < self.arcs; ++j) {
      var nx = radius*Math.cos(j*horz_angle);
      var ny = radius*Math.sin(j*horz_angle);
      self.verts[3*(j+i*self.arcs)+0] = nx;
      self.verts[3*(j+i*self.arcs)+1] = ny;
      self.verts[3*(j+i*self.arcs)+2] = z;
    }
  }
  var index = 0;
  for (var i = 0; i < self.stacks-1; ++i) {
    for (var j = 0; j < self.arcs; ++j) {
      self.indices[index+0] = (i+0)*self.arcs+j+0;
      self.indices[index+1] = (i+1)*self.arcs+j+0;
      self.indices[index+2] = (i+0)*self.arcs+((j+1) % self.arcs);

      index += 3;
      
      self.indices[index+0] = (i+0)*self.arcs+((j+1) % self.arcs);
      self.indices[index+1] = (i+1)*self.arcs+j+0;
      self.indices[index+2] = (i+1)*self.arcs+((j+1) % self.arcs);
      index += 3;
    }
  }
  var pos = vec3.create(), normal = vec3.create();
  return {
    add_transformed : function(geom, center, radius, color) {
      var base_index = geom.num_verts();
      for (var i = 0; i < self.stacks*self.arcs; ++i) {
        vec3.set(normal, self.verts[3*i+0], self.verts[3*i+1], self.verts[3*i+2]);
        vec3.copy(pos, normal);
        vec3.scale(pos, pos, radius);
        vec3.add(pos, pos, center);
        geom.add_vertex(pos, normal, color);
      }
      for (var i = 0; i < self.indices.length/3; ++i) {
        geom.add_triangle(base_index+self.indices[i*3+0], base_index+self.indices[i*3+1], 
                          base_index+self.indices[i*3+2]);
      }
    }
  };
}

// A tube profile is a cross-section of a tube, e.g. a circle or a 'flat' square. They
// are used to control the style of helices, strands and coils for the cartoon
// render mode. 
var TubeProfile = function(points, num, strength) {

  var interpolated = catmull_rom_spline(points, num, strength, true);

  var self = {
    indices : new Uint16Array(interpolated.length*2),
    verts : interpolated,
    normals : new Float32Array(interpolated.length),
    arcs : interpolated.length/3,
  };

  var normal = vec3.create();
  for (var i = 0; i < self.arcs; ++i) {
    var i_prev = i == 0 ? self.arcs-1 : i-1;
    var i_next = i == self.arcs-1 ? 0 : i+1;
    normal[0] = self.verts[3*i_next+1] - self.verts[3*i_prev+1];
    normal[1] = self.verts[3*i_prev+0] - self.verts[3*i_next+0];
    vec3.normalize(normal, normal);
    self.normals[3*i+0] = normal[0];
    self.normals[3*i+1] = normal[1];
    self.normals[3*i+2] = normal[2];
  }

  for (var i = 0; i < self.arcs; ++i) {
    self.indices[6*i+0] = i;
    self.indices[6*i+1] = i+self.arcs;
    self.indices[6*i+2] = ((i+1) % self.arcs) + self.arcs;
    self.indices[6*i+3] = i;
    self.indices[6*i+4] = ((i+1) % self.arcs) + self.arcs;
    self.indices[6*i+5] = (i+1) % self.arcs;
  }

  var pos = vec3.create(), normal = vec3.create();
  return {
    add_transformed : function(geom, center, radius, rotation, color, first) {
      var base_index = geom.num_verts() - self.arcs;
      for (var i = 0; i < self.arcs; ++i) {
        vec3.set(pos, radius*self.verts[3*i+0], radius*self.verts[3*i+1], 
                 0.0);
        vec3.transformMat3(pos, pos, rotation);
        vec3.add(pos, pos, center);
        vec3.set(normal, self.normals[3*i+0], self.normals[3*i+1], 0.0);
        vec3.transformMat3(normal, normal, rotation);
        geom.add_vertex(pos, normal, color);
      }
      if (first) {
        return;
      }
      for (var i = 0; i < self.indices.length/3; ++i) {
        geom.add_triangle(base_index+self.indices[i*3+0], base_index+self.indices[i*3+1], 
                          base_index+self.indices[i*3+2]);
      }
    }
  };
}

var R = 0.7071;
var COIL_POINTS = [
  -R, -R, 0,
   R, -R, 0,
   R, R, 0,
  -R,  R, 0
];


var HELIX_POINTS = [
  -3*R, -1.0*R, 0,
   3*R, -1.0*R, 0,
   3*R, 1.0*R, 0,
  -3*R,  1.0*R, 0
];

var ProtoCylinder = function(arcs) {
  var self = {
    arcs : arcs,
    indices : new Uint16Array(arcs*3*2),
    verts : new Float32Array(3*arcs*2),
    normals : new Float32Array(3*arcs*2),
  };
  var angle = Math.PI*2/self.arcs
  for (var i = 0; i < self.arcs; ++i) {
    var cos_angle = Math.cos(angle*i);
    var sin_angle = Math.sin(angle*i);
    self.verts[3*i+0] = cos_angle;
    self.verts[3*i+1] = sin_angle;
    self.verts[3*i+2] = -0.5;
    self.verts[3*arcs+3*i+0] = cos_angle;
    self.verts[3*arcs+3*i+1] = sin_angle;
    self.verts[3*arcs+3*i+2] = 0.5;
    self.normals[3*i+0] = cos_angle;
    self.normals[3*i+1] = sin_angle;
    self.normals[3*arcs+3*i+0] = cos_angle;
    self.normals[3*arcs+3*i+1] = sin_angle;
  }
  for (var i = 0; i < self.arcs; ++i) {
    self.indices[6*i+0] = (i+0) % self.arcs;
    self.indices[6*i+1] = arcs+((i+1) % self.arcs);
    self.indices[6*i+2] = (i+1) % self.arcs;

    self.indices[6*i+3] = (i+0) % self.arcs;
    self.indices[6*i+4] = arcs+((i+0) % self.arcs);
    self.indices[6*i+5] = arcs+((i+1) % self.arcs);
  }
  return {
    add_transformed : function(geom, center, length, radius, rotation, clr_one, clr_two) {
      var base_index = geom.num_verts();
      var pos = vec3.create(), normal = vec3.create(), color;
      for (var i = 0; i < 2*self.arcs; ++i) {
        vec3.set(pos, radius*self.verts[3*i+0], radius*self.verts[3*i+1], 
                 length*self.verts[3*i+2]);
        vec3.transformMat3(pos, pos, rotation);
        vec3.add(pos, pos, center);
        vec3.set(normal, self.normals[3*i+0], self.normals[3*i+1], self.normals[3*i+2]);
        vec3.transformMat3(normal, normal, rotation);
        geom.add_vertex(pos, normal, i < self.arcs ? clr_one : clr_two);
      }
      for (var i = 0; i < self.indices.length/3; ++i) {
        geom.add_triangle(base_index+self.indices[i*3+0], base_index+self.indices[i*3+1], 
                          base_index+self.indices[i*3+2]);
      }
    }
  };
};

// an (indexed) mesh geometry container.
//
// stores the vertex data in interleaved format. not doing so has severe performance penalties
// in WebGL, and by severe I mean orders of magnitude slower than using an interleaved array.
var MeshGeom = function() {
  var self = {
    interleaved_buffer : gl.createBuffer(),
    index_buffer : gl.createBuffer(),
    vert_data : [],
    index_data : [],
    num_triangles : 0,
    num_verts : 0,
    ready : false,
  };

  return {
    num_verts : function() { return self.num_verts; },
    draw: function(shader_program) {
      this.bind();
      var pos_attrib = gl.getAttribLocation(shader_program, 'attr_pos');
      gl.enableVertexAttribArray(pos_attrib);
      gl.vertexAttribPointer(pos_attrib, 3, gl.FLOAT, false, 9*4, 0*4);

      var normal_attrib = gl.getAttribLocation(shader_program, 'attr_normal');
      gl.enableVertexAttribArray(normal_attrib);
      gl.vertexAttribPointer(normal_attrib, 3, gl.FLOAT, false, 9*4, 3*4);

      var clr_attrib = gl.getAttribLocation(shader_program, 'attr_color');
      gl.vertexAttribPointer(clr_attrib, 3, gl.FLOAT, false, 9*4, 6*4);
      gl.enableVertexAttribArray(clr_attrib);
      gl.drawElements(gl.TRIANGLES, self.num_triangles*3, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(pos_attrib);
      gl.disableVertexAttribArray(clr_attrib);
      gl.disableVertexAttribArray(normal_attrib);
    },
    add_vertex : function(pos, normal, color) {
      self.vert_data.push(pos[0]);
      self.vert_data.push(pos[1]);
      self.vert_data.push(pos[2]);
      self.vert_data.push(normal[0]);
      self.vert_data.push(normal[1]);
      self.vert_data.push(normal[2]);
      self.vert_data.push(color[0]);
      self.vert_data.push(color[1]);
      self.vert_data.push(color[2]);
      self.num_verts += 1;
    },
    add_triangle : function(idx1, idx2, idx3) {
      self.index_data.push(idx1);
      self.index_data.push(idx2);
      self.index_data.push(idx3);
      self.num_triangles +=1;
    },
    bind : function() {
      gl.bindBuffer(gl.ARRAY_BUFFER, self.interleaved_buffer);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, self.index_buffer);
      if (!self.ready) {
        var float_array = new Float32Array(self.vert_data);
        gl.bufferData(gl.ARRAY_BUFFER, float_array, gl.STATIC_DRAW);
        var index_array = new Uint16Array(self.index_data);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index_array, gl.STATIC_DRAW);
        self.ready = true;
        self.index_data = [];
        self.vert_data = [];
      }
    },
  };
};

var Cam = function() {
  var self = {
    projection : mat4.create(),
    modelview : mat4.create(),

    center : vec3.create(),
    zoom : 50,
    rotation : mat4.create(),
    translation : mat4.create(),
    update_mat : true,
  }; 


  function update_if_needed() {
    if (!self.update_mat) {
      return;
    }
    mat4.identity(self.modelview);
    mat4.translate(self.modelview, self.modelview, 
                   [-self.center[0], -self.center[1], -self.center[2]]);
    mat4.mul(self.modelview, self.rotation, self.modelview);
    mat4.identity(self.translation);
    mat4.translate(self.translation, self.translation, [0,0, -self.zoom]);
    mat4.mul(self.modelview, self.translation, self.modelview);
    self.update_mat = false;
  }

  mat4.perspective(self.projection, 45.0, gl.viewportWidth / gl.viewportHeight, 
                   0.1, 400.0);
  mat4.translate(self.modelview, self.modelview, [0, 0, -20]);
  return {

    set_center : function(point) {
      self.update_mat = true;
      vec3.copy(self.center, point);
    },
    rotate_z : function(delta) {
      self.update_mat = true;
      var tm = mat4.create();
      mat4.rotate(tm, tm, delta, [0,0,1]);
      mat4.mul(self.rotation, tm, self.rotation);
    },
    rotate_x: function(delta) {
      self.update_mat = true;
      var tm = mat4.create();
      mat4.rotate(tm, tm, delta, [1,0,0]);
      mat4.mul(self.rotation, tm, self.rotation);
    },
    rotate_y : function(delta) {
      self.update_mat = true;
      var tm = mat4.create();
      mat4.rotate(tm, tm, delta, [0,1,0]);
      mat4.mul(self.rotation, tm, self.rotation);
    },
    zoom : function(delta) {
      self.update_mat = true;
      self.zoom += delta;
    },

    bind : function(shader) {
      update_if_needed();
      gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
      shader.projection = gl.getUniformLocation(shader, 'projection_mat');
      shader.modelview = gl.getUniformLocation(shader, 'modelview_mat');
      gl.uniformMatrix4fv(shader.projection, false, self.projection);
      gl.uniformMatrix4fv(shader.modelview, false, self.modelview);
    }
  };
};


var PV = function(dom_element, width, height) {
  var canvas_element = document.createElement('canvas');
  canvas_element.width = width || 800;
  canvas_element.height = height || 800;
  dom_element.appendChild(canvas_element);

  var self = {
    dom_element : canvas_element,
    objects : [],
  };


  function init_gl() {
    // todo wrap in try-catch for browser which don't support WebGL
    gl = self.dom_element.getContext('experimental-webgl', { antialias: true });
    gl.viewportWidth = self.dom_element.width;
    gl.viewportHeight = self.dom_element.height;

    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.lineWidth(2.0);
    gl.cullFace(gl.FRONT);
    //gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
  }

  function shader_from_element(gl, element) {
    var shader_code = get_element_contents(element);
    var shader;
    if (element.type == 'x-shader/x-fragment') {
      shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (element.type == 'x-shader/x-vertex') {
      shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
      console.error('could not determine type for shader');
      return null;
    }
    gl.shaderSource(shader, shader_code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  function init_shader() {
    var frag_shader = shader_from_element(gl, document.getElementById('shader-fs'));
    var vert_shader = shader_from_element(gl, document.getElementById('shader-vs'));
    var shader_program = gl.createProgram();
    gl.attachShader(shader_program, vert_shader);
    gl.attachShader(shader_program, frag_shader);
    gl.linkProgram(shader_program);
    if (!gl.getProgramParameter(shader_program, gl.LINK_STATUS)) {
      console.error('could not initialise shaders')
    }
    return shader_program;
  };

  function mouse_up(event) {
    self.dom_element.removeEventListener('mousemove', mouse_move, false);
    self.dom_element.removeEventListener('mouseup', mouse_up, false);
    self.dom_element.removeEventListener('mouseout', mouse_out, false);
    document.removeEventListener('mousemove', mouse_move);
  }
  var shader_program;
  var cam;
  
  function init_pv() {
    init_gl();
    cam = Cam();
    shader_program = init_shader();
    gl.useProgram(shader_program);
  }


  var pv = {
    add : function(stuff) {
      self.objects.push(stuff);
    },

    draw : function() {
      cam.bind(shader_program);
      gl.clear(gl.COLOR_BUFFER_BIT| gl.DEPTH_BUFFER_BIT);
      for (var i=0; i<self.objects.length; i+=1) {
        self.objects[i].draw(shader_program);
      }
    },
    center_on : function(thing) {
      cam.set_center(thing.center());
    }
  };
  function mouse_wheel(event) {
    cam.zoom(event.wheelDelta*0.05);
    pv.draw();
  }
  function mouse_down(event) {
    event.preventDefault();
    self.dom_element.addEventListener('mousemove', mouse_move, false);
    document.addEventListener('mousemove', mouse_move, false);
    self.dom_element.addEventListener('mouseup', mouse_up, false);
    document.addEventListener('mouseup', mouse_up, false);
    self.dom_element.addEventListener('mouseout', mouse_out, false);
    last_mouse_pos = { x: event.pageX, y: event.pageY };
  }


  function mouse_move(event) {
    var new_mouse_pos = { x : event.pageX, y : event.pageY };
    var delta = { x : new_mouse_pos.x - last_mouse_pos.x,
                  y : new_mouse_pos.y - last_mouse_pos.y};
                  
    var speed = 0.005;
    cam.rotate_x(speed*delta.y);
    cam.rotate_y(speed*delta.x);
    last_mouse_pos = new_mouse_pos;
    pv.draw();
  }

  function mouse_out(event) {}
  self.dom_element.addEventListener('mousewheel', mouse_wheel, false);
  self.dom_element.addEventListener('mousedown', mouse_down, false);

  document.addEventListener('DOMContentLoaded', init_pv);
  return pv;
};


// derive a rotation matrix which rotates the z-axis onto tangent. when
// left is given and use_hint is true, x-axis is chosen to be as close
// as possible to left.
//
// upon returning, left will be modified to contain the updated left
// direction.
var build_rotation = (function() {


  return function(rotation, tangent, left, up, use_left_hint) {
    if (use_left_hint) {
      vec3.cross(up, tangent, left);
    } else {
      ortho_vec(up, tangent);
    }

    vec3.cross(left, up, tangent);
    vec3.normalize(up, up);
    vec3.normalize(left, left);
    rotation[0] = left[0];
    rotation[1] = left[1];
    rotation[2] = left[2];

    rotation[3] = up[0];
    rotation[4] = up[1];
    rotation[5] = up[2];

    rotation[6] = tangent[0];
    rotation[7] = tangent[1];
    rotation[8] = tangent[2];
  }
})();

function Mol() {
  this._chains = [];
  this._next_atom_index = 0;
}

function MolBase() {
}

MolBase.prototype.each_residue = function(callback) {
  for (var i = 0; i < this._chains.length; i+=1) {
    this._chains[i].each_residue(callback);
  }
}

MolBase.prototype.each_atom = function(callback) {
  for (var i = 0; i < this._chains.length; i+=1) {
    this._chains[i].each_atom(callback);
  }
}

MolBase.prototype.line_trace = function(opts) {
  opts = opts || {};
  var options = {
    color : opts.color || uniform_color([1, 0, 1]),
  }
  var clr_one = vec3.create(), clr_two = vec3.create();
  var line_geom = LineGeom();
  var prev_residue = false;
  for (var ci  in this._chains) {
    var chain = this._chains[ci];
    chain.each_backbone_trace(function(trace) {
      for (var i = 1; i < trace.length; ++i) {
        options.color(trace[i-1].atom('CA'), clr_one, 0);
        options.color(trace[i+0].atom('CA'), clr_two, 0);
        line_geom.add_line(trace[i-1].atom('CA').pos(), clr_one, 
                           trace[i-0].atom('CA').pos(), clr_two);
      }
    });
  }
  return line_geom;
}


MolBase.prototype.spheres = function(opts) {
  console.time('MolBase.spheres');
  opts = opts || {};
  var options = {
    color : opts.color || uniform_color([1, 0, 1]),
  }
  var clr = vec3.create();
  var geom = MeshGeom();
  var proto_sphere = ProtoSphere(8, 8);
  this.each_atom(function(atom) {
    options.color(atom, clr, 0);
    proto_sphere.add_transformed(geom, atom.pos(), 1.5, clr);
  });
  console.timeEnd('MolBase.spheres');
  return geom;
}

MolBase.prototype.sline = function(opts) {
  console.time('MolBase.sline');
  opts = opts || {};
  var options = {
    color : opts.color || uniform_color([1, 0, 1]),
    spline_detail : opts.spline_detail || 8,
    strength: opts.strength || 0.5,
  };
  var line_geom = LineGeom();
  var pos_one = vec3.create(), pos_two = vec3.create();
  var clr_one = vec3.create(), clr_two = vec3.create();
  for (var ci  in this._chains) {
    var chain = this._chains[ci];
    chain.each_backbone_trace(function(trace) {
      var positions = new Float32Array(trace.length*3);
      var colors = new Float32Array(trace.length*3);
      for (var i = 0; i < trace.length; ++i) {
        var atom = trace[i].atom('CA');
        options.color(atom, colors, 3*i);
        var p = atom.pos();
        positions[i*3+0] = p[0];
        positions[i*3+1] = p[1];
        positions[i*3+2] = p[2];
      }
      var subdivided = catmull_rom_spline(positions, options.spline_detail, 
                                          options.strength, false);
      var interpolated_color = interpolate_color(colors, options.spline_detail);
      for (var i = 1, e = subdivided.length/3; i < e; ++i) {
        pos_one[0] = subdivided[3*(i-1)+0];
        pos_one[1] = subdivided[3*(i-1)+1];
        pos_one[2] = subdivided[3*(i-1)+2];
        pos_two[0] = subdivided[3*(i-0)+0];
        pos_two[1] = subdivided[3*(i-0)+1];
        pos_two[2] = subdivided[3*(i-0)+2];

        clr_one[0] = interpolated_color[3*(i-1)+0];
        clr_one[1] = interpolated_color[3*(i-1)+1];
        clr_one[2] = interpolated_color[3*(i-1)+2];
        clr_two[0] = interpolated_color[3*(i-0)+0];
        clr_two[1] = interpolated_color[3*(i-0)+1];
        clr_two[2] = interpolated_color[3*(i-0)+2];
        line_geom.add_line(pos_one, clr_one, pos_two, clr_two);
      }
    });
  }
  console.timeEnd('MolBase.sline');
  return line_geom;
},

// FIXME: refactoring into smaller pieces.
MolBase.prototype.cartoon = function(opts) {
  console.time('Mol.cartoon');
  opts = opts || {};

  var options = {
    color : opts.color || uniform_color([1, 0, 1]),
    strength: opts.strength || 0.5,
    spline_detail : opts.spline_detail || 4,
    arc_detail : opts.arc_detail || 8,
    radius : opts.radius || 0.3,
    force_tube: opts.force_tube || false,
  }
  var geom = MeshGeom();
  var tangent = vec3.create(), pos = vec3.create(), left =vec3.create();
  var up = vec3.create();
  var rotation = mat3.create();
  var coil_profile = TubeProfile(COIL_POINTS, options.arc_detail, 1.0);
  var heli_profile = TubeProfile(HELIX_POINTS, options.arc_detail, 0.0);
  var strand_profile = TubeProfile(HELIX_POINTS, options.arc_detail, 0.0);
  var color = vec3.create();
  var normal = vec3.create();
  var last_left = vec3.create();
  var clr = vec3.fromValues(0.3, 0.3, 0.3);
  var sheet_dir = 1;
  var prev_normal = vec3.create();
  var lr = null;
  function tube_add(pos, left, res, tangent, color, first) {
    var ss = res.ss();
    var radius2 = options.radius;
    var radius1 = options.radius;
    var prof = coil_profile
    if (ss == 'H' && !options.force_tube) {
      prof = heli_profile;
    } else if (ss == 'E' && !options.force_tube) {
      prof = strand_profile;
    } else {
      vec3.cross(left, up, tangent);
    }
    vec3.copy(last_left, left);

    build_rotation(rotation, tangent, left, up, true);

    prof.add_transformed(geom, pos, radius1, rotation, color, first);
  }
  for (var ci = 0; ci < this._chains.length; ++ci) {
    var chain = this._chains[ci];
    chain.each_backbone_trace(function(trace) {
      var positions = new Float32Array(trace.length*3);
      var colors = new Float32Array(trace.length*3);
      var normals = new Float32Array(trace.length*3);

      var strand_start = null;
      var strand_end = null;
      for (var i = 0; i < trace.length; ++i) {
        var p = trace[i].atom('CA').pos();
        var o = trace[i].atom('O').pos();
        if (trace[i].ss() == 'E') {
          if (strand_start === null) {
            strand_start = i;
          }
          strand_end = i;
        } else {
          if (strand_start !== null) {
            inplace_smooth(positions, strand_start-1, strand_end+1);
            strand_start = null;
            strand_end = null;
          }
        }
        positions[i*3+0] = p[0];
        positions[i*3+1] = p[1];
        positions[i*3+2] = p[2];
        var dx = o[0] - p[0];
        var dy = o[1] - p[1];
        var dz = o[2] - p[2];
        var div = 1.0/Math.sqrt(dx*dx+dy*dy+dz*dz);
        normals[i*3+0] = dx * div;
        normals[i*3+1] = dy * div;
        normals[i*3+2] = dz * div;
        options.color(trace[i].atom('CA'), colors, i*3);
      }
      var subdivided = catmull_rom_spline(positions, options.spline_detail, 
                                          options.strength, false);
      var smooth_normals = interpolate_normals(normals, options.spline_detail);
      var interpolated_color = interpolate_color(colors, options.spline_detail);
      vec3.set(tangent, subdivided[3]-subdivided[0], subdivided[4]-subdivided[1],
                subdivided[5]-subdivided[2]);

      vec3.set(pos, subdivided[0], subdivided[1], subdivided[2]);
      vec3.set(normal, smooth_normals[0], smooth_normals[1], smooth_normals[2]);
      vec3.normalize(tangent, tangent);
      tube_add(pos, normal, trace[0], tangent, interpolated_color, true);
      for (var i = 1, e = subdivided.length/3 - 1; i < e; ++i) {
        vec3.set(pos, subdivided[3*i+0], subdivided[3*i+1], subdivided[3*i+2]);
        vec3.set(normal, smooth_normals[3*i+0], smooth_normals[3*i+1], 
                  smooth_normals[3*i+2]);
        vec3.set(tangent, subdivided[3*(i+1)+0]-subdivided[3*(i-1)+0],
                  subdivided[3*(i+1)+1]-subdivided[3*(i-1)+1],
                  subdivided[3*(i+1)+2]-subdivided[3*(i-1)+2]);
        vec3.normalize(tangent, tangent);
        vec3.set(color, interpolated_color[i*3+0], interpolated_color[i*3+1],
                interpolated_color[i*3+2]);
        tube_add(pos, normal, trace[Math.floor(i/options.spline_detail)], 
                  tangent, color, false);
      }
      vec3.set(tangent, 
                subdivided[subdivided.length-3]-subdivided[subdivided.length-6], 
                subdivided[subdivided.length-2]-subdivided[subdivided.length-5],
                subdivided[subdivided.length-1]-subdivided[subdivided.length-4]);

      vec3.set(pos, subdivided[subdivided.length-3], subdivided[subdivided.length-2], 
                subdivided[subdivided.length-1]);
      vec3.set(normal, smooth_normals[smooth_normals.length-3],
                smooth_normals[smooth_normals.length-2],
                smooth_normals[smooth_normals.length-1]);
      vec3.normalize(tangent, tangent);
      vec3.set(color, interpolated_color[interpolated_color.length-3],
                interpolated_color[interpolated_color.length-2],
                interpolated_color[interpolated_color.length-1]);
                
      tube_add(pos, normal, trace[trace.length-1], tangent, color, false);
    });
  }
  console.timeEnd('Mol.cartoon');
  return geom;
}
// renders the protein using a smoothly interpolated tube, essentially identical to the
// cartoon render mode, but without special treatment for helices and strands.
MolBase.prototype.tube = function(opts) {
  opts = opts || {};
  opts.force_tube = true;
  return this.cartoon(opts);
}

MolBase.prototype.lines = function(opts) {
  console.time('MolBase.lines');
  opts = opts || {};
  var options = {
    color : opts.color || cpk_color(),
  };
  var mp = vec3.create();
  var line_geom = LineGeom();
  var clr = vec3.create();
  this.each_atom(function(atom) {
    // for atoms without bonds, we draw a small cross, otherwise these atoms 
    // would be invisible on the screen.
    if (atom.bonds().length) {
      atom.each_bond(function(bond) {
        bond.mid_point(mp); 
        options.color(bond.atom_one(), clr, 0);
        line_geom.add_line(bond.atom_one().pos(), clr, mp, clr);
        options.color(bond.atom_two(), clr, 0);
        line_geom.add_line(mp, clr, bond.atom_two().pos(), clr);

      });
    } else {
      var cs = 0.2;
      var pos = atom.pos();
      options.color(atom, clr, 0);
      line_geom.add_line([pos[0]-cs, pos[1], pos[2]], clr, [pos[0]+cs, pos[1], pos[2]], clr);
      line_geom.add_line([pos[0], pos[1]-cs, pos[2]], clr, [pos[0], pos[1]+cs, pos[2]], clr);
      line_geom.add_line([pos[0], pos[1], pos[2]-cs], clr, [pos[0], pos[1], pos[2]+cs], clr);
    }
  });
  console.timeEnd('MolBase.lines');
  return line_geom;
}

MolBase.prototype.trace = function(opts) {
  opts = opts || {}
  var options = {
    color : opts.color || uniform_color([1, 0, 0]),
    radius: opts.radius || 0.3
  }
  var clr_one = vec3.create(), clr_two = vec3.create();
  var geom = MeshGeom();
  var prev_residue = false;
  var proto_cyl = ProtoCylinder(8);
  var proto_sphere = ProtoSphere(8, 8);
  var rotation = mat3.create();
  var dir = vec3.create();
  var left = vec3.create();
  var up = vec3.create();
  for (var ci = 0; ci < self.chains.length; ++ci) {
    var chain = self.chains[ci];
    chain.each_backbone_trace(function(trace) {
      options.color(trace[0].atom('CA'), clr_one, 0);
      proto_sphere.add_transformed(geom, trace[0].atom('CA').pos(), options.radius,
                                    clr_one);
      for(var i = 1; i < trace.length; ++i) {
        var ca_prev_pos = trace[i-1].atom('CA').pos();
        var ca_this_pos = trace[i+0].atom('CA').pos();
        options.color(trace[i].atom('CA'), clr_two, 0);
        proto_sphere.add_transformed(geom, ca_this_pos, options.radius,
                                      clr_two);
        vec3.sub(dir, ca_this_pos, ca_prev_pos);
        var length = vec3.length(dir);

        vec3.scale(dir, dir, 1.0/length);

        build_rotation(rotation, dir, left, up, false);

        var mid_point = vec3.clone(ca_prev_pos);
        vec3.add(mid_point, mid_point, ca_this_pos);
        vec3.scale(mid_point, mid_point, 0.5);
        proto_cyl.add_transformed(geom, mid_point, length, options.radius, rotation, 
                                  clr_one, clr_two);
        vec3.copy(clr_one, clr_two);
      }
    });
  }
  return geom;
}

MolBase.prototype.center = function() {
  var sum = vec3.create();
  var count = 1;
  this.each_atom(function(atom) {
    vec3.add(sum, sum, atom.pos());
    count+=1;
  });
  if (count) {
    vec3.scale(sum, sum, 1/count);
  }
  return sum;
}

Mol.prototype = new MolBase()

Mol.prototype.chains = function() { return this._chains; }

Mol.prototype.residue_select = function(predicate) {
  console.time('Mol.residue_select');
  var view = new MolView(this);
  for (var ci = 0; ci < this._chains.length; ++ci) {
    var chain = this._chains[ci];
    var chain_view = null;
    var residues = chain.residues();
    for (var ri = 0; ri < residues.length; ++ri) {
      if (predicate(residues[ri])) {
        if (!chain_view) {
          chain_view = view.add_chain(chain, false);
        }
        chain_view.add_residue(residues[ri], true);
      }
    }
  }
  console.timeEnd('Mol.residue_select')
  return view;
}
Mol.prototype.select = function(what) {

  if (what == 'protein') {
    return this.residue_select(function(r) { return r.is_aminoacid(); });
  }
  if (what == 'water') {
    return this.residue_select(function(r) { return r.is_water(); });
  }
  if (what == 'ligand') {
    return this.residue_select(function(r) { 
      return !r.is_aminoacid() && !r.is_water();
    });
  }
  return view;
}

Mol.prototype.chain = function(name) { 
  for (var i = 0; i < this._chains.length; ++i) {
    if (this._chains[i].name() == name) {
      return this._chains[i];
    }
  }
  return null;
}

Mol.prototype.next_atom_index = function() {
  var next_index = this._next_atom_index; 
  this._next_atom_index+=1; 
  return next_index; 
}

Mol.prototype.add_chain = function(name) {
  var chain = new Chain(this, name);
  this._chains.push(chain);
  return chain;
}


Mol.prototype.connect = function(atom_a, atom_b) {
  var bond = new Bond(atom_a, atom_b);
  atom_a.add_bond(bond);
  atom_b.add_bond(bond);
  return bond;
}

// determine connectivity structure. for simplicity only connects atoms of the same 
// residue and peptide bonds
Mol.prototype.derive_connectivity = function() {
  console.time('Mol.derive_connectivity');
  var this_structure = this;
  var prev_residue;
  this.each_residue(function(res) {
    var d = vec3.create();
    for (var i = 0; i < res.atoms().length; i+=1) {
    for (var j = 0; j < i; j+=1) {
      var sqr_dist = vec3.sqrDist(res.atom(i).pos(), res.atom(j).pos());
      if (sqr_dist < 1.6*1.6) {
          this_structure.connect(res.atom(i), res.atom(j));
      }
    }
    }
    if (prev_residue) {
    var c_atom = prev_residue.atom('C');
    var n_atom = res.atom('N');
    if (c_atom && n_atom) {
      var sqr_dist = vec3.sqrDist(c_atom.pos(), n_atom.pos());
      if (sqr_dist < 1.6*1.6) {
        this_structure.connect(n_atom, c_atom);
      }
    }
    }
    prev_residue = res;
  });
  console.timeEnd('Mol.derive_connectivity');
}

// add chain to view
MolView.prototype.add_chain = function(chain, recurse) {
  var chain_view = new ChainView(this, chain);
  this._chains.push(chain_view);
  if (recurse) {
    var residues = chain.residues();
    for (var i = 0; i< residues.length; ++i) {
      chain_view.add_residue(residues[i], true);
    }
  }
  return chain_view;
}


function Residue(chain, name, num) {
  this._name = name
  this._num = num;
  this._atoms = [];
  this._ss = 'C';
  this._chain = chain;
}

Residue.prototype = new ResidueBase();

Residue.prototype.name = function() { return this._name; }

Residue.prototype.num = function() { return this._num; }

Residue.prototype.add_atom = function(name, pos, element) {
  var atom = new Atom(this, name, pos, element);
  this._atoms.push(atom);
  return atom;
}

Residue.prototype.ss = function() { return this._ss; }
Residue.prototype.set_ss = function(ss) { this._ss = ss; }

Residue.prototype.atoms = function() { return this._atoms; }
Residue.prototype.chain = function() { return this._chain; }


Residue.prototype.structure = function() { 
  return this._chain.structure(); 
}

function AtomBase() {
}

AtomBase.prototype.name = function() { return this._name; },
AtomBase.prototype.pos = function() { return this._pos; },
AtomBase.prototype.element = function() { return this._element; },
AtomBase.prototype.index = function() { return this._index; },
AtomBase.prototype.each_bond = function(callback) {
  for (var i = 0; i < this._bonds.length; ++i) {
    callback(this._bonds[i]);
  }
}

function Atom(residue, name, pos, element) {
  this._residue = residue;
  this._bonds = [];
  this._name = name;
  this._pos = pos;
  this._element = element;
}

Atom.prototype = new AtomBase();

Atom.prototype.add_bond = function(bond) { this._bonds.push(bond); },
Atom.prototype.name = function() { return this._name; },
Atom.prototype.bonds = function() { return this._bonds; }
Atom.prototype.residue = function() { return this._residue; }
Atom.prototype.structure = function() { return this._residue.structure(); }

var Bond = function(atom_a, atom_b) {
  var self = {
    atom_one : atom_a,
    atom_two : atom_b,
  };
  return {
    atom_one : function() { return self.atom_one; },
    atom_two : function() { return self.atom_two; },

    // calculates the mid-point between the two atom positions
    mid_point : function(out) { 
      if (!out) {
        out = vec3.create();
      }
      vec3.add(out, self.atom_one.pos(), self.atom_two.pos());
      vec3.scale(out, out, 0.5);
      return out;
    }
  };
}


var load_pdb_from_element = function(element) {
  return load_pdb(get_element_contents(element));
}


function parse_helix_record(line) {
  // FIXME: handle insertion codes
  var frst_num = parseInt(line.substr(21, 4));
  var last_num = parseInt(line.substr(33, 4));
  var chain_name = line[19];
  return { first : frst_num, last : last_num, chain_name : chain_name };
}

function parse_sheet_record(line) {
  // FIXME: handle insertion codes
  var frst_num = parseInt(line.substr(22, 4));
  var last_num = parseInt(line.substr(33, 4));
  var chain_name = line[21];
  return { first : frst_num, last : last_num, chain_name : chain_name };
}

// a truly minimalistic PDB parser. It will die as soon as the input is 
// not well-formed. it only reas ATOM and HETATM records, everything else 
// is ignored. in case of multi-model files, only the first model is read.
//
// FIXME: load PDB currently spends a substantial amount of time creating
// the vec3 instances for the atom positions. it's possible that it's
// cheaper to initialize a bulk buffer once and create buffer views to
// that data for each atom position. since all atoms are released at once,
// that's not really a problem...
var load_pdb = function(text) {
  console.time('load_pdb'); 
  var structure = new Mol();
  var curr_chain = null;
  var curr_res = null;
  var curr_atom = null;
  
  var helices = [];
  var sheets = [];
  function parse_and_add_atom(line, hetatm) {
    var alt_loc = line[16];
    if (alt_loc!=' ' && alt_loc!='A') {
      return;
    }
    var chain_name = line[21];
    var res_name = line.substr(17, 3);
    var atom_name = line.substr(12, 4).trim();
    var rnum_num = parseInt(line.substr(22, 4));
    var ins_code = line[26];
    var update_residue = false;
    var update_chain = false;
    if (!curr_chain || curr_chain.name() != chain_name) {
      update_chain = true;
      update_residue = true;
    }
    if (!curr_res || curr_res.num() != rnum_num) {
      update_residue = true;
    }
    if (update_chain) {
      curr_chain = structure.add_chain(chain_name);
    }
    if (update_residue) {
      curr_res = curr_chain.add_residue(res_name, rnum_num);
    }
    var pos = vec3.create();
    for (var i=0;i<3;++i) {
      pos[i] = (parseFloat(line.substr(30+i*8, 8)));
    }
    curr_res.add_atom(atom_name, pos, line.substr(77, 2).trim());
  }
  var lines = text.split(/\r\n|\r|\n/g);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var record_name = line.substr(0, 6);

    if (record_name == 'ATOM  ') {
      parse_and_add_atom(line, false);
      continue;
    }
    if (record_name == 'HETATM') {
      parse_and_add_atom(line, true);
      continue;
    }
    if (record_name == 'HELIX ') {
      helices.push(parse_helix_record(line));
      continue;
    }
    if (record_name == 'SHEET ') {
      sheets.push(parse_sheet_record(line));
      continue;
    }
    if (record_name == 'END') {
      break;
    }
  }
  for (var i = 0; i < sheets.length; ++i) {
    var sheet = sheets[i];
    var chain = structure.chain(sheet.chain_name);
    if (chain) {
      chain.assign_ss(sheet.first, sheet.last, 'E');
    }
  }
  for (var i = 0; i < helices.length; ++i) {
    var helix = helices[i];
    var chain = structure.chain(helix.chain_name);
    if (chain) {
      chain.assign_ss(helix.first, helix.last, 'H');
    }
  }
  structure.derive_connectivity();
  console.timeEnd('load_pdb');

  return structure;
};

/*
var N = 100000;

function test_vec3_pool() {
  console.time('vec3_pool');
  var ab = new ArrayBuffer(N*3*4);
  var l = []
  for (var i = 0; i < N; ++i) {
    l.push(new Float32Array(ab, 3*i*4, 3));
  }
  console.timeEnd('vec3_pool');
}

function test_vec3_create() {
  console.time('vec3_create');
  var l = []
  for (var i = 0; i < N; ++i) {
    l.push(vec3.create());
  }
  console.timeEnd('vec3_create');
}

test_vec3_pool();
test_vec3_create();
*/
