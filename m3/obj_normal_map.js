var vertex_phong = `#version 300 es
    in vec4 a_position; // in instead of attribute
    in vec4 a_color; // in instead of attribute
    in vec4 a_normal; // in instead of attribute
    in vec4 a_tangent; // in instead of attribute
    in vec2 a_texcoord; // in instead of attribute
    in vec3 a_barycoord; // barycentric coordinates

    uniform mat4 u_mvp_mat;
    uniform mat4 u_normal_mat;
    uniform mat4 u_model_mat;
    
    out vec2 v_texcoord; // out instead of varying
    out vec3 v_barycoord; // out instead of varying

    out vec4 v_color; // out instead of varying
    out vec3 v_normal; 
    out vec3 v_tangent; 
    out vec3 v_position;

    void main() {
        v_position = vec3(u_model_mat * a_position);
        v_normal = normalize(vec3(u_normal_mat * a_normal));
        v_tangent = normalize(vec3(u_normal_mat * a_tangent));

        v_color = a_color;

        v_texcoord = a_texcoord;
        v_barycoord = a_barycoord;

        gl_Position = u_mvp_mat * a_position;
    }
`;

var frag_phong = `#version 300 es
    precision mediump float;

    uniform sampler2D u_image;
    uniform sampler2D u_bump; // normal map
    uniform bool u_is_texture; // texture map exists
    uniform bool u_is_bump; // normal map exists
    in vec2 v_texcoord;
    in vec3 v_barycoord;

    in vec4 v_color; 
    in vec3 v_normal; 
    in vec3 v_tangent; 
    in vec3 v_position;

    out vec4 cg_FragColor; // user-defined instead of gl_FragColor

    void main() {
        vec4 cout;
        vec3 bump;
        if (u_is_texture) { // texture map exists
            vec3 c = texture(u_image, v_texcoord).rgb; // texel color
            c = c * v_color.rgb; // obj shaded and textured
            cout = vec4(c, 1.0);
            
        }
        else cout = v_color;  

        if (u_is_bump) { // normal map exists
            bump = texture(u_bump, v_texcoord).rgb; // normal map color
            bump = bump * 2.0 - 1.0; // [-1, 1]            
        }
        
        // Normalize normal cause it's interpolated and not 1.0 in length any more
        vec3 normal = normalize(v_normal);
        vec3 tangent = normalize(v_tangent);
        vec3 bitangent = normalize(cross(normal, tangent)); // B = N x T

        mat3 TBN = mat3(tangent, bitangent, normal); // note column-major order

        normal = normalize(TBN * bump); // bump-adjusted normal

        vec3 eye_position = vec3(0.0, 20.0, 40.0); 
        vec3 light_position = vec3(20.0, 60.0, 40.0); // same as camera

        float shininess = 40.0;

        // Calculate the light direction and make it 1.0 in length
        vec3 light_dir = normalize(light_position - v_position);

        // The dot product of the light direction and the normal
        vec3 diffuse = max(dot(light_dir, normal), 0.0) * cout.rgb;

        // Calculate the eye direction and make it 1.0 in length
        vec3 eye_dir = normalize(eye_position - v_position);

        // The halfway vector between light_dir and eye_dir
        vec3 halfway = (light_dir + eye_dir) / length(light_dir + eye_dir);

        vec3 specular = pow(max(dot(normal, halfway), 0.0), shininess) * cout.rgb;

        cg_FragColor = vec4(diffuse + specular, cout.a);
    }
`;

let config = {
    SPEED_X: 0.0,
    SPEED_Y: 0.0,
    CAMERA_DIST: 30,
    SHADER: 0,
    normalUrl : '/textures/concrete/normal.jpg',
    textureUrl : '/textures/concrete/texture.jpg'
}

let gui = new dat.GUI({ width: 300 });
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const mesh = new THREE.Mesh(geometry, material);

function startGUI() {
    /* GUI options */
    const guiOptions = {
        surface: "concrete",
        texture: true,
        normal: true,
    };
    /* Textures */
    const concrete = "concrete";
    const stone = "stone";
    const rock = "rock";
    const gravle = "gravle";

    const guiTextureHash = {
        concrete: concrete,
        stone: stone,
        rock: rock,
        gravle: gravle
    };

    /* Add to gui */
    gui.add(guiOptions, "surface", Object.keys(guiTextureHash)).onChange((value) => {
        clearTheCanvas();
        this.surface = value;
        this.normalUrl = '/textures/' + value + '/normal.jpg';
        this.textureUrl = '/textures/' + value + '/texture.jpg';
        main();
    });

    textureController =
        gui.add(guiOptions, 'texture')
            .name('texture')
            .listen();
    textureController.onChange(
         (newValue) => {
            clearTheCanvas();
            this.useTexture = newValue;
            main();
        });

    normalcontroller =
        gui.add(guiOptions, 'normal')
            .name('normal')
            .listen();
    normalcontroller.onChange(
         (newValue) => {
            clearTheCanvas();
            this.useNormal = newValue;
            main();
        });
}

startGUI();

function clearTheCanvas() {
    var elem = document.getElementById("canvas");
        elem.remove();
        var canvasNew = document.createElement('canvas');
        canvasNew.id = 'canvas';
        canvasNew.height = "600";
        canvasNew.width = "600";
        document.getElementsByTagName('body')[0].appendChild(canvasNew);
        gl, canvas;
        g_obj = null;
        g_data = null;
        vao_obj = null;
        g_texture = [];
        g_image = [];
        g_vp_mat;
        g_anim_id;
        g_prog = [];
}

//let url_prefix = "http://www.cs.umsl.edu/~kang/htdocs/models/";
//let url = url_prefix + "sphere.obj";
//let url = url_prefix + "crate2.obj";
//let url = url_prefix + "heart.obj";

//serve obj from local
let url = '/objfiles/sphere.obj';

let gl, canvas;
let g_obj = null;
// The information of OBJ file
let g_data = null;
// The data needed for drawing 3D model
let vao_obj = null; // vertex array object for obj
let g_texture = [];
let g_image = [];
//let g_cur_angle = 0.0;
let g_vp_mat;
let g_anim_id;
let g_prog = []; // shader programs

function update_bind() {
    g_prog[config.SHADER].bind(); // switch to different shader program
}

function render(canvas, gl) {
    cancelAnimationFrame(g_anim_id); // to avoid duplicate requests

    g_vp_mat = new Matrix4();
    g_vp_mat.setPerspective(30.0, canvas.width / canvas.height, 0.1, 5000.0);

    let cam_pos = calc_camera_pos();
    g_vp_mat.lookAt(cam_pos.x, cam_pos.y, cam_pos.z, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0);

    var update = function () {
        if (g_obj != null && g_obj.mtl_ready() && g_obj.tex_ready()) {
            
            vao_obj = gl.createVertexArray();
            gl.bindVertexArray(vao_obj);
            buffer_objects = init_buffer_objects(g_prog[config.SHADER]);
            g_data = g_obj.get_data();
            send_buffer_data(buffer_objects);
            gl.bindVertexArray(null);
            g_obj = null; // data already sent to GPU. Don't do it again.
        }

        if (vao_obj) { // vao defined
            gl.bindVertexArray(vao_obj);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            draw_obj(g_prog[config.SHADER], g_vp_mat);
            gl.disable(gl.BLEND);
            gl.bindVertexArray(null);
        }

        g_anim_id = requestAnimationFrame(update);
    };
    update();
}

function cg_init_shaders(gl, vshader, fshader) {
    var program = createProgram(gl, vshader, fshader); // defined in cuon-utils.js

    return program;
}

class GLProgram {
    constructor(vertex_shader, frag_shader) {
        this.attributes = {};
        this.uniforms = {};
        this.program = gl.createProgram();

        this.program = cg_init_shaders(gl, vertex_shader, frag_shader);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            throw gl.getProgramInfoLog(this.program);

        const attribute_count = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
        for (let i = 0; i < attribute_count; i++) {
            const attribute_name = gl.getActiveAttrib(this.program, i).name;
            this.attributes[attribute_name] = gl.getAttribLocation(this.program, attribute_name);
        }

        // register uniform variables
        const uniform_count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniform_count; i++) {
            const uniform_name = gl.getActiveUniform(this.program, i).name;
            this.uniforms[uniform_name] = gl.getUniformLocation(this.program, uniform_name);
        }
    }

    bind() {
        gl.useProgram(this.program);
    }
}

function main() {
    _that = this;
    if(this.useNormal == undefined) {
        this.useNormal = true;
    }
    if(this.useTexture == undefined) {
        this.useTexture = true;
    } 

    if(this.normalUrl == undefined) {
        this.normalUrl =  config.normalUrl;
    }
    if(this.textureUrl == undefined) {
        this.textureUrl = config.textureUrl;
    }
    canvas = document.getElementById('canvas');
    gl = canvas.getContext('webgl2');
    g_prog.push(new GLProgram(vertex_phong, frag_phong));
    g_prog[0].bind(); // initially, use first shader program
    cg_register_event_handlers();
    gl.clearColor(0.2, 0.2, 0.2, 1.0);
    gl.enable(gl.DEPTH_TEST);
    get_obj_file(url, 0.3, true); // sphere.obj
    render(canvas, gl);
}


// Create buffer objects and store them in Object
function init_buffer_objects(program) {
    var o = new Object();
    o.vertex_buffer = create_empty_buffer_object(program.attributes.a_position, 3, gl.FLOAT);
    o.normal_buffer = create_empty_buffer_object(program.attributes.a_normal, 3, gl.FLOAT);
    o.tangent_buffer = create_empty_buffer_object(program.attributes.a_tangent, 3, gl.FLOAT);
    o.texcoord_buffer = create_empty_buffer_object(program.attributes.a_texcoord, 2, gl.FLOAT);
    o.barycoord_buffer = create_empty_buffer_object(program.attributes.a_barycoord, 3, gl.FLOAT);
    o.color_buffer = create_empty_buffer_object(program.attributes.a_color, 4, gl.FLOAT);
    o.index_buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return o;
}

// Create a buffer object, assign it to attribute variables, and enable the assignment
function create_empty_buffer_object(a_attribute, num, type) {

    var buffer = gl.createBuffer();
    // Create a buffer object

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(a_attribute, num, type, false, 0, 0);
    // Assign the buffer object to the attribute variable
    gl.enableVertexAttribArray(a_attribute);
    // Enable the assignment

    return buffer;
}

function get_obj_file(obj_filename, scale, reverse) {
    var request = new XMLHttpRequest(); // create Ajax request 

    // even handler function to handle server's response 
    request.onreadystatechange = function () {
        if (request.readyState === 4 && request.status !== 404) {
            // readySate = 4 means process comlete
            // file access successful and ready 
            read_obj_file(request.responseText, obj_filename, scale, reverse);
            // request.responseText contains file content (long string)
        }
    }

    request.open('GET', obj_filename, true);
    // Create a request to acquire .obj file
    request.send();
    // Send the request
}

// Ajax for .obj file returned. Now let's parse .obj file
function read_obj_file(file_string, obj_filename, scale, reverse) {

    g_obj = new OBJ(obj_filename);
    // Create an OBJ object
    var result = g_obj.parse(file_string, scale, reverse);
    // Parse the .obj file

    if (!result) { // parse error
        g_obj = null;
        g_data = null;
        return;
    }
}

// matrices
var g_model_mat = new Matrix4();
var g_mvp_mat = new Matrix4();
var g_normal_mat = new Matrix4();
let right_pos = new Vector4([1, 0, 0, 1]); // right pos (rotated by y-roll)
let cur_right_pos = new Vector4([1, 0, 0, 1]); // right pos (rotated by y-roll)
let y_roll_mat = new Matrix4();
let inv_y_roll_mat = new Matrix4();

function draw_obj(program, vp_mat) {

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Clear color and depth buffers

    config.SPEED_X *= 0.9;
    config.SPEED_Y *= 0.9;
    let p = cur_right_pos.elements;
    g_model_mat.rotate(config.SPEED_X, p[0], p[1], p[2]);
    g_model_mat.rotate(config.SPEED_Y, 0, 1, 0);
    y_roll_mat.rotate(config.SPEED_Y, 0, 1, 0);
    inv_y_roll_mat.setInverseOf(y_roll_mat);
    cur_right_pos = inv_y_roll_mat.multiplyVector4(right_pos);

    // Calculate the normal transformation matrix and pass it to u_normal_mat
    g_normal_mat.setInverseOf(g_model_mat);
    g_normal_mat.transpose();
    gl.uniformMatrix4fv(program.uniforms.u_normal_mat, false, g_normal_mat.elements);

    // Calculate the model view project matrix and pass it to u_mvp_mat
    g_mvp_mat.set(vp_mat);
    g_mvp_mat.multiply(g_model_mat);
    gl.uniformMatrix4fv(program.uniforms.u_mvp_mat, false, g_mvp_mat.elements);
    gl.uniformMatrix4fv(program.uniforms.u_model_mat, false, g_model_mat.elements);

    //console.log("g_texture.length = " + g_texture.length);
    if (g_texture.length > 0) {
        // Pass the texure unit to u_image
        gl.uniform1i(program.uniforms.u_image, 0);
        gl.uniform1i(program.uniforms.u_is_texture, true);
    }
    if (g_texture.length > 1) { // normal map exists
        // Pass the texure unit to u_image
        gl.uniform1i(program.uniforms.u_bump, 1);
        gl.uniform1i(program.uniforms.u_is_bump, true);
    }

    gl.drawElements(gl.TRIANGLES, g_data.indices.length, gl.UNSIGNED_INT, 0);
}

// call bufferData(...) to send vertices, normals, colors, indices to GPU 
function send_buffer_data(buffer_objects) {

    // Write date into the buffer object
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_objects.vertex_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, g_data.vertices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_objects.normal_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, g_data.normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_objects.tangent_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, g_data.tangents, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_objects.texcoord_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, g_data.texcoords, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_objects.barycoord_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, g_data.barycoords, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer_objects.color_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, g_data.colors, gl.STATIC_DRAW);

    // Write the indices to the buffer object
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer_objects.index_buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g_data.indices, gl.STATIC_DRAW);
}

//------------------------------------------------------------------------------
// OBJParser
//------------------------------------------------------------------------------

// OBJ object Constructor
var OBJ = function (obj_filename) {

    this.obj_filename = obj_filename;
    this.mtls = new Array(0);
    // .obj may contain multiple .mtl files
    this.objects = new Array(0);
    // .obj may contain multiple objects
    this.vert = new Array(0);
    // Initialize the vetex coordinates
    this.norm = new Array(0);
    // Initialize the normal vectors
    this.texcoord = new Array(0);
    // Initialize the texture coordinates
    this.useTexture = true;
    this.useNormal = true;
}

// Parsing the OBJ file
OBJ.prototype.parse = function (file_string, scale, reverse) {

    var lines = file_string.split('\n');
    // Break up .obj file content into individual lines and store them as array

    lines.push(null);
    // Append null to signal EOF 

    var index = 0;
    // current index of array lines

    var cur_material_name = ""; // in case there is a material name
    var cur_texture_name = ""; // in case there is a texture image name
    var cur_object = null;

    // Parse one line at a time
    var line;
    // current line (string)

    var sp = new StringParser(); // StringParser is user-defined object
    // StringParser stores current line 

    while ((line = lines[index++]) != null) { // parse one line at a time

        sp.init(line);
        // copies current line into StringParser sp

        var command = sp.get_word(); // v, vn, vt, f, ...
        // Get next command (the first word in current line)

        if (command == null) continue;
        // null command

        switch (command) {
            case '#': // Skip comments
                continue;
            case 'mtllib': // Read .mtl file 
                var path = this.parse_mtllib(sp, this.obj_filename);
                // obtain .mtl file name using .obj path
                // path = /home/cs6410/models/cube.mtl
                var mtl = new MTL();
                // Create MTL instance
                this.mtls.push(mtl);
                // .obj file may contain multiple .mtl files 

                var mtl_request = new XMLHttpRequest(); // Ajax request
                mtl_request.onreadystatechange = function () {
                    if (mtl_request.readyState == 4) { // process complete
                        if (mtl_request.status != 404) { // file found
                            // .mtl file access successful
                            mtl.parse_mtl_file(mtl_request.responseText);
                            // mtl_request.responseText contains .mtl file content as string
                        }
                        else mtl.ready = true; // .mtl file not found
                    }
                }
                mtl_request.open('GET', path, true);
                // Create a request to acquire .mtl file
                // path = /home/cs6410/models/cube.mtl
                mtl_request.send();
                // Send the Ajax request
                continue;
            // Go to the next line
            case 'o': // object name
            case 'g': // group name (treated the same way as 'o')
                // read object name or group namee
                var object = this.parse_object_name(sp);
                // .obj may contain multiple objects 
                this.objects.push(object); // add new object (or group) into array
                cur_object = object;
                continue;
            // Go to the next line
            case 'v':
                if (this.objects.length == 0) { // no registerd object yet
                    let object = new Group("default");
                    this.objects.push(object); // add new object into array
                    cur_object = object;
                }
                // Read vertex
                var vertex = this.parse_vertex(sp, scale);
                // scale object size so it would fit the canvas
                this.vert.push(vertex); // add vertex to vert array
                continue;
            // Go to the next line
            case 'vn':
                // Read vertex normal
                var normal = this.parse_normal(sp);
                this.norm.push(normal); // add vertex normal to norm array
                continue;
            // Go to the next line
            case 'vt':
                // Read vertex normal
                var texcoord = this.parse_texcoord(sp);
                this.texcoord.push(texcoord); // add texcoord to texcoord array
                continue;
            // Go to the next line
            case 'usemtl': // followed by material name 
                // Read Material name (e.g., "shinyred")
                cur_material_name = this.parse_usemtl(sp);
                continue;
            // Go to the next line
            case 'f':
                // Read face
                var face = this.parse_face(sp, cur_material_name, this.vert, this.texcoord, reverse);
                // reverse flips normal vector 
                cur_object.add_face(face);
                continue;
            // Go to the next line
        }
    }

    return true;
}

// get .mtl file path
OBJ.prototype.parse_mtllib = function (sp, obj_filename) {

    // Get directory path of obj_filename
    // e.g., /home/cs6410/models/cube.obj
    var i = obj_filename.lastIndexOf("/"); // locate the last / in the path

    let dir_path = "";
    if (i > 0) dir_path = obj_filename.substr(0, i + 1); // /home/cs6410/models/

    let mtl_filename = sp.get_word(); // shinyred.mtl 
    console.log(mtl_filename);

    return dir_path + mtl_filename; // /home/cs6410/models/shinyred.mtl
    // Get path
}

// get object name
OBJ.prototype.parse_object_name = function (sp) {
    var object_name = sp.get_word(); // get the next word in file (object name)
    return (new Group(object_name));
}

// get x, y, z for v
OBJ.prototype.parse_vertex = function (sp, scale) {
    var x = sp.get_float() * scale; // scale in x
    var y = sp.get_float() * scale; // scale in y
    var z = sp.get_float() * scale; // scale in z
    return (new Vertex(x, y, z));
}

// get x, y, z for vn
OBJ.prototype.parse_normal = function (sp) {
    var x = sp.get_float();
    var y = sp.get_float();
    var z = sp.get_float();
    return (new Normal(x, y, z));
}

// get x, y for vt
OBJ.prototype.parse_texcoord = function (sp) {
    var x = sp.get_float();
    var y = sp.get_float();
    return (new Texcoord(x, y));
}

// get material name
OBJ.prototype.parse_usemtl = function (sp) {
    return sp.get_word(); // get material name (e.g., "Shinyred")
}

// process 'f 1/1/1 2/2/2 3/3/3 ...'
OBJ.prototype.parse_face = function (sp, material_name, vert, texcoord, reverse) {

    var face = new Face(material_name);

    // process each line of 'f 1/1/1 2/2/2 3/3/3 ...'
    while (true) {  // f 1/1/1 2/2/2 3/3/3 ...
        var word = sp.get_word(); // 1/1/1
        if (word == null) break; // reached end of line so exit loop 

        let sub_words = "";
        if (word.search("//") != -1) { // f 1//1 2//2 3//3
            //console.log("// detected!");
            sub_words = word.split('//'); // 1//1

            var vi = parseInt(sub_words[0]) - 1; // vertex index
            face.v_index.push(vi);

            var ni = parseInt(sub_words[1]) - 1; // normal index 
            face.n_index.push(ni);

            face.t_index.push(-1); // no texture index found
        }
        else if (word.search("/") != -1) { // f 1/1/1 2/2/2 3/3/3
            sub_words = word.split('/'); // 1/1/1

            var vi = parseInt(sub_words[0]) - 1; // vertex index
            face.v_index.push(vi);

            var ti = parseInt(sub_words[1]) - 1; // texture index 
            face.t_index.push(ti);

            var ni = parseInt(sub_words[2]) - 1; // normal index 
            face.n_index.push(ni);
        }
        else { // f 1 2 3 4
            var vi = parseInt(word) - 1; // vertex index
            face.v_index.push(vi);
            face.n_index.push(-1); // no normal index found
            face.t_index.push(-1); // no texture index found
        }
    }

    // calc face normal, in case vertex normals not available
    // assuming this face is a triangle 
    var v0 = [vert[face.v_index[0]].x, vert[face.v_index[0]].y, vert[face.v_index[0]].z];
    var v1 = [vert[face.v_index[1]].x, vert[face.v_index[1]].y, vert[face.v_index[1]].z];
    var v2 = [vert[face.v_index[2]].x, vert[face.v_index[2]].y, vert[face.v_index[2]].z];

    var face_normal = calc_normal(v0, v1, v2); // compute face normal 

    if (face_normal == null) { // normal calculation not possible
        if (face.v_index.length >= 4) { // more complex polygon than triangle 
            var v3 = [vert[face.v_index[3]].x, vert[face.v_index[3]].y, vert[face.v_index[3]].z];
            face_normal = calc_normal(v1, v2, v3);
        }
        if (face_normal == null) { // normal calculation still not possible            
            face_normal = [0.0, 1.0, 0.0];
        }
    }

    if (reverse) { // flip face normal vector 
        face_normal[0] = -face_normal[0];
        face_normal[1] = -face_normal[1];
        face_normal[2] = -face_normal[2];
    }

    face.normal = new Normal(face_normal[0], face_normal[1], face_normal[2]);
    // adding to this instance of Face, but not the template of Face

    // compute tangent
    var t0 = [texcoord[face.t_index[0]].x, texcoord[face.t_index[0]].y];
    var t1 = [texcoord[face.t_index[1]].x, texcoord[face.t_index[1]].y];
    var t2 = [texcoord[face.t_index[2]].x, texcoord[face.t_index[2]].y];

    let tangent = calc_tangent(v0, v1, v2, t0, t1, t2); // compute tangent vector

    face.tangent = new Tangent(tangent[0], tangent[1], tangent[2]);
    // adding to this instance of Face, but not the template of Face  

    // Divide to triangles if face contains more than 3 vertices
    // this is necessary because we draw gl.TRIANGLES
    if (face.v_index.length > 3) {
        var n2 = face.v_index.length - 2; // n-2 inner triangles within n-gon
        var new_v_index = new Array(n2 * 3);
        var new_n_index = new Array(n2 * 3);
        var new_t_index = new Array(n2 * 3);

        for (var i = 0; i < n2; i++) {
            new_v_index[i * 3 + 0] = face.v_index[0]; // shared by all inner triangles
            new_v_index[i * 3 + 1] = face.v_index[i + 1];
            new_v_index[i * 3 + 2] = face.v_index[i + 2];
            new_n_index[i * 3 + 0] = face.n_index[0]; // shared by all inner triangles
            new_n_index[i * 3 + 1] = face.n_index[i + 1];
            new_n_index[i * 3 + 2] = face.n_index[i + 2];
            new_t_index[i * 3 + 0] = face.t_index[0]; // shared by all inner triangles
            new_t_index[i * 3 + 1] = face.t_index[i + 1];
            new_t_index[i * 3 + 2] = face.t_index[i + 2];
        }
        face.v_index = new_v_index; // this face now has more vertices
        face.n_index = new_n_index; // this face now has more normals
        face.t_index = new_t_index; // this face now has more texcoords
    }

    face.num_index = face.v_index.length; // this face has this many indices
    // adding to this instance of Face, not the template of Face

    return face;
}

// Check if every material is ready
OBJ.prototype.mtl_ready = function () {

    if (this.mtls.length == 0) return true;

    for (var i = 0; i < this.mtls.length; i++) {
        if (!this.mtls[i].ready) // found a material not ready
            return false;
    }

    return true;
}

// Check if every texture image is ready
OBJ.prototype.tex_ready = function () {

    for (var i = 0; i < g_texture.length; i++) {
        if (!g_texture[i].ready) // found a texture not ready
            return false;
    }

    return true;
}

// Find color by material name
OBJ.prototype.find_color = function (material_name) {

    for (var i = 0; i < this.mtls.length; i++) {
        for (var j = 0; j < this.mtls[i].materials.length; j++) {

            // trim() must be used to remove any whitespace chars (even hidden ones)
            if (this.mtls[i].materials[j].name.trim() == material_name.trim()) {
                return (this.mtls[i].materials[j].color);
            }
        }
    }
    return (new Col(0.0, 0.8, 0.0, 1));
}

//------------------------------------------------------------------------------
// Retrieve the information for drawing 3D model
// Create vertices, normals, colors, indices
OBJ.prototype.get_data = function () {
    // Create arrays for vertex coordinates, normals, colors, and indices
    var num_index = 0;

    for (var i = 0; i < this.objects.length; i++) {
        // note that .obj file may contain multiple objects
        num_index += this.objects[i].num_index; // add to the total number of indices
    }

    var vertices = new Float32Array(num_index * 3); // total number of vertices
    var normals = new Float32Array(num_index * 3); // same number as vertices
    var tangents = new Float32Array(num_index * 3); // same number as vertices    
    var barycoords = new Float32Array(num_index * 3); // same number as vertices
    var texcoords = new Float32Array(num_index * 2); // same number as vertices
    var colors = new Float32Array(num_index * 4);
    //var indices = new Uint16Array(num_index); // max index: 65,536
    var indices = new Uint32Array(num_index); // total number of indices

    // Set vertex, normal and color
    var ii = 0; // start counting index 

    // OBJ.vertices contains the number of unique vertices
    // vertices contains duplicated vertices shared by multiple faces
    // this is because each vertex may have multiple associated normals
    // in the end, the number of vertices and number of normals must equal

    for (var i = 0; i < this.objects.length; i++) {
        // .obj file may contain multiple objects

        var object = this.objects[i];

        for (var j = 0; j < object.faces.length; j++) { // visit each face

            var face = object.faces[j];

            //console.log("face.material_name = " + face.material_name);
            var color = this.find_color(face.material_name);
            // find material color using material name 

            var face_normal = face.normal; // calculated face normal
            // use face_normal in case vn is missing from .obj file  

            var face_tangent = face.tangent; // calculated face tangent
            // use face_tangent in case normal map is used

            for (var k = 0; k < face.v_index.length; k++) {

                // face.v_index.length may be bigger than 3
                // k denotes each vertex in current face

                // Set index
                indices[ii] = ii;

                // Copy vertex
                var vIdx = face.v_index[k];

                var vertex = this.vert[vIdx];

                vertices[ii * 3 + 0] = vertex.x;
                vertices[ii * 3 + 1] = vertex.y;
                vertices[ii * 3 + 2] = vertex.z;

                barycoords[ii * 3 + 0] = (k % 3 == 0) ? 1 : 0;
                barycoords[ii * 3 + 1] = (k % 3 == 1) ? 1 : 0;
                barycoords[ii * 3 + 2] = (k % 3 == 2) ? 1 : 0;

                var tIdx = face.t_index[k];
                if (tIdx >= 0 && _that.useTexture == true) { // texcoord exists
                    var texcoord = this.texcoord[tIdx];

                    texcoords[ii * 2 + 0] = texcoord.x;
                    texcoords[ii * 2 + 1] = texcoord.y;
                }
                else {
                    texcoords[ii * 2 + 0] = 0; // default texcoord: (0, 0)
                    texcoords[ii * 2 + 1] = 0; // default texcoord: (0, 0)
                }

                // Copy color
                colors[ii * 4 + 0] = color.r;
                colors[ii * 4 + 1] = color.g;
                colors[ii * 4 + 2] = color.b;
                colors[ii * 4 + 3] = color.a;

                var nIdx = face.n_index[k];
                if (nIdx >= 0 && _that.useNormal == true) {
                    var normal = this.norm[nIdx];

                    normals[ii * 3 + 0] = normal.x;
                    normals[ii * 3 + 1] = normal.y;
                    normals[ii * 3 + 2] = normal.z;
                }
                else { // use face normals instead
                    normals[ii * 3 + 0] = face_normal.x;
                    normals[ii * 3 + 1] = face_normal.y;
                    normals[ii * 3 + 2] = face_normal.z;
                }

                // copy tangent
                tangents[ii * 3 + 0] = face_tangent.x;
                tangents[ii * 3 + 1] = face_tangent.y;
                tangents[ii * 3 + 2] = face_tangent.z;

                ii++;
            }
        }
    }
    document.getElementById("info").innerHTML = "vertex count: " + this.vert.length;

    return new DrawingInfo(vertices, normals, tangents, texcoords, barycoords, colors, indices);
}

//------------------------------------------------------------------------------
// MTL Object
//------------------------------------------------------------------------------
var MTL = function () {
    this.ready = false;
    // true means MTL is configured correctly
    this.materials = new Array(0);
}

MTL.prototype.parse_newmtl = function (sp) {

    let word = sp.get_word(); // get material name
    //console.log("word = " + word); // 

    return word;
}

MTL.prototype.parse_rgb = function (sp, name) {
    // name: material name
    var r = sp.get_float();
    var g = sp.get_float();
    var b = sp.get_float();
    //console.log("[r, g, b] = " + r + " " + g + " " + b);

    return (new Material(name, r, g, b, 1));
}

// get .png file path
MTL.prototype.parse_map_Kd = function (sp) {

    let tex_filename = sp.get_word(); // image.png 

    tex_filename = url_prefix + tex_filename;
    //console.log(tex_filename);

    return tex_filename; // http://www.cs.umsl.edu/~kang/htdocs/models/image.png
    // Get path
}

// get .png file path
MTL.prototype.parse_map_Bump = function (sp) {

    let tex_filename = sp.get_word(); // image.png 

    tex_filename = url_prefix + tex_filename;
    //console.log(tex_filename);

    return tex_filename; // http://www.cs.umsl.edu/~kang/htdocs/models/image.png
    // Get path
}

// Analyze .mtl file
MTL.prototype.parse_mtl_file = function (file_string) {

    var lines = file_string.split('\n');
    // Break up into lines and store them as array
    lines.push(null);
    // Append null to signal EOF
    var index = 0;
    // Initialize index of line

    // Parse line by line
    var line;
    // A string in the line to be parsed
    var mtl_name = "";
    // Material name
    var sp = new StringParser();
    // Create StringParser

    while ((line = lines[index++]) != null) {

        sp.init(line);
        // init StringParser
        var command = sp.get_word();
        // Get command
        if (command == null) continue;
        // null command
        switch (command) {
            case '#':
                continue;
            // Skip comments
            case 'newmtl':
                // Read material name            
                mtl_name = this.parse_newmtl(sp);
                // Get material name
                continue;
            // Go to the next line
            case 'Kd':
                // Read diffuse material color 
                if (mtl_name == "") continue;
                // Go to the next line because material name is unknown
                var material = this.parse_rgb(sp, mtl_name);
                this.materials.push(material);
                mtl_name = "";
                continue;
            // Go to the next line
            case 'map_Kd': // Read .png file for diffuse material color         
                load_texture_image(textureUrl);
                continue;
            // Go to the next line            
            case 'map_Bump': // Read .png file for normal map        
                load_texture_image(normalUrl);
                continue;
            // Go to the next line   
        }
    }
    this.ready = true;
}

let load_texture_image = function (url) {

    // Create a texture object
    g_texture.push(gl.createTexture());
    let i = g_texture.length - 1;

    g_image.push(new Image());
    g_image[i].crossOrigin = "";
    g_image[i].src = url;

    g_texture[i].ready = false; // texture not ready yet

    g_image[i].onload = function () {
        texture_setup(i);
        g_texture[i].ready = true; // texture ready now
    }
}

let texture_setup = function (i) {

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1); // Flip the image's y axis
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, g_texture[i]);

    // Set the parameters so we can render any size image.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g_image[i]);
}

//------------------------------------------------------------------------------
// Material Object
//------------------------------------------------------------------------------
var Material = function (name, r, g, b, a) {
    this.name = name;
    this.color = new Col(r, g, b, a);
}

//------------------------------------------------------------------------------
// Vertex Object
//------------------------------------------------------------------------------
var Vertex = function (x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
}

//------------------------------------------------------------------------------
// Normal Object
//------------------------------------------------------------------------------
var Normal = function (x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
}

//------------------------------------------------------------------------------
// Tangent Object
//------------------------------------------------------------------------------
var Tangent = function (x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
}

//------------------------------------------------------------------------------
// Textcoord Object
//------------------------------------------------------------------------------
var Texcoord = function (x, y) {
    this.x = x;
    this.y = y;
}

//------------------------------------------------------------------------------
// Col Object
//------------------------------------------------------------------------------
var Col = function (r, g, b, a) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
}

//------------------------------------------------------------------------------
// Group Object
//------------------------------------------------------------------------------
var Group = function (name) {
    this.name = name;
    this.faces = new Array(0);
    this.num_index = 0;
}

Group.prototype.add_face = function (face) {
    this.faces.push(face);
    this.num_index += face.num_index;
}

//------------------------------------------------------------------------------
// Face Object
//------------------------------------------------------------------------------
// Constructor
var Face = function (material_name) {
    this.material_name = material_name;
    if (material_name == null) this.material_name = "";
    this.v_index = new Array(0);
    this.t_index = new Array(0);
    this.n_index = new Array(0);
}

//------------------------------------------------------------------------------
// DrawInfo Object
//------------------------------------------------------------------------------
// Constructor
var DrawingInfo = function (vertices, normals, tangents, texcoords, barycoords, colors, indices) {
    this.vertices = vertices;
    this.normals = normals;
    this.tangents = tangents;
    this.texcoords = texcoords;
    this.barycoords = barycoords;
    this.colors = colors;
    this.indices = indices;
}

//------------------------------------------------------------------------------
// Constructor for StringParser object
var StringParser = function (str) {
    this.str;
    // Store the string specified by the argument
    this.cur;
    // current position in the string to be processed
    this.init(str);
}

// Initialize StringParser object
StringParser.prototype.init = function (str) {
    this.str = str;
    this.cur = 0;
}

// Skip delimiters
StringParser.prototype.skip_delimiters = function () {

    for (var i = this.cur, len = this.str.length; i < len; i++) {
        var c = this.str.charAt(i);
        // Skip TAB, Space, '(', ')
        if (c == '\t' || c == ' ' || c == '(' || c == ')' || c == '"')
            continue;
        break;
    }
    this.cur = i;
}

// Skip to the next word
StringParser.prototype.skip_to_next_word = function () {

    this.skip_delimiters();

    var n = get_word_length(this.str, this.cur);
    this.cur += (n + 1);
}

// Get the next word
StringParser.prototype.get_word = function () {

    this.skip_delimiters(); // get to the next word in the file

    // get word length starting from this.cur
    var n = get_word_length(this.str, this.cur);

    if (n == 0) return null;

    var word = this.str.substr(this.cur, n);

    this.cur += (n + 1);

    return word;
}

// Get integer
StringParser.prototype.get_int = function () {

    return parseInt(this.get_word());
}

// Get floating number
StringParser.prototype.get_float = function () {

    return parseFloat(this.get_word());
}

// Get the length of word starting from index start
function get_word_length(str, start) {

    var n = 0;

    for (var i = start, len = str.length; i < len; i++) {
        var c = str.charAt(i);
        if (c == '\t' || c == ' ' || c == '(' || c == ')' || c == '"')
            break;
    }

    return i - start;
}

//------------------------------------------------------------------------------
// Common function
//------------------------------------------------------------------------------
// compute face normal of a triangle 
function calc_normal(p0, p1, p2) {
    // v0: a vector from p1 to p0, v1; a vector from p1 to p2
    var v0 = new Float32Array(3);
    var v1 = new Float32Array(3);
    for (var i = 0; i < 3; i++) {
        v0[i] = p0[i] - p1[i];
        v1[i] = p2[i] - p1[i];
    }

    // The cross product of v0 and v1
    var c = new Float32Array(3);
    c[0] = v0[1] * v1[2] - v0[2] * v1[1];
    c[1] = v0[2] * v1[0] - v0[0] * v1[2];
    c[2] = v0[0] * v1[1] - v0[1] * v1[0];

    // Normalize the result
    var v = new Vector3(c); // defined in cuon-matrix.js
    v.normalize();

    return v.elements; // unpack into JavaScript array
}

// compute face tangent of a triangle 
function calc_tangent(p0, p1, p2, t0, t1, t2) {
    // e0: a vector from p0 to p1, e1; a vector from p0 to p2
    var e0 = new Float32Array(3);
    var e1 = new Float32Array(3);
    for (var i = 0; i < 3; i++) {
        e0[i] = p1[i] - p0[i];
        e1[i] = p2[i] - p0[i];
    }

    // d0: deltaUV from p0 to p1, d1; deltaUV from p0 to p2
    var d0 = new Float32Array(2);
    var d1 = new Float32Array(2);
    for (var i = 0; i < 2; i++) {
        d0[i] = t1[i] - t0[i];
        d1[i] = t2[i] - t0[i];
    }

    let f = 1 / (d0[0] * d1[1] - d1[0] * d0[1]); // 1 over determinant

    // The cross product of v0 and v1
    var c = new Float32Array(3);
    c[0] = f * (d1[1] * e0[0] - d0[1] * e1[0]);
    c[1] = f * (d1[1] * e0[1] - d0[1] * e1[1]);
    c[2] = f * (d1[1] * e0[2] - d0[1] * e1[2]);

    // Normalize the result
    var v = new Vector3(c); // defined in cuon-matrix.js
    v.normalize();

    return v.elements; // unpack into JavaScript array
}

// compute camera position 
function calc_camera_pos() {
    // v0: a vector from p1 to p0, v1; a vector from p1 to p2
    let d = new THREE.Vector3(0, 20, 40);
    d = d.normalize();
    d = d.multiplyScalar(config.CAMERA_DIST);

    return d; // unpack into JavaScript array
}

//////////////////////////////////////////////////////////////////////////////////
// mouse controls
////////////////////////////////////////////////////////////////////////////
function cg_register_event_handlers() {
    canvas.addEventListener("wheel", cg_wheel);
    canvas.addEventListener("mousedown", cg_mousedown);
    canvas.addEventListener("mouseup", cg_mouseup);
    canvas.addEventListener("mousemove", cg_mousemove);
}

function cg_wheel(e) {
    if (e.deltaY > 0) { // going down (zoom out)
        config.CAMERA_DIST += 5.0;
        render();
    }
    else { // going up (zoom in)
        config.CAMERA_DIST -= 5.0;
        if (config.CAMERA_DIST < 5) config.CAMERA_DIST = 5.0;
        render();
    }
}

let dragging = false;         // Dragging or not
let old_x = -1, old_y = -1;   // Last position of the mouse

function cg_mousedown(e) {
    console.log("pressed");
    // (x, y): mouse position within canvas    
    var x = e.offsetX, y = e.offsetY;
    // Start dragging 
    old_x = x; old_y = y;
    dragging = true;
};

function cg_mouseup(e) {
    dragging = false;
};

function cg_mousemove(e) {
    var x = e.offsetX, y = e.offsetY;
    if (dragging) {
        var factor = 0.2; // Rotation factor
        var dx = factor * (x - old_x); // how much horizontal move (y-roll)
        var dy = factor * (y - old_y); // how much vertical move (x-roll)
        config.SPEED_X += dy;
        config.SPEED_Y += dx;
    }
    old_x = x, old_y = y;
};

////////////////////////////////////////////////////////////////////////////////////////
