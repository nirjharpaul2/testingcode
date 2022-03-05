var VSHADER_SOURCE = `#version 300 es
   in vec4 a_Position;
   in vec2 a_TexCoord;
   in vec4 a_Color;
   in vec4 a_Normal;
   uniform mat4 u_MvpMatrix;      // MVP matrix
   uniform mat4 u_ModelMatrix;    // Model matrix
   uniform mat4 u_NormalMatrix;   // Transformation matrix of the normal
   uniform vec3 u_LightColor;     // Light color
   uniform vec3 u_LightPosition;  // Position of the light source
   uniform vec3 u_AmbientLight;   // Ambient light color
   out vec2 v_TexCoord; // UV-texture coord for this vertex
   out vec4 v_Color; // diffuse + ambient reflection (grayscale)

   void main() {
     vec4 color = vec4(1.0, 1.0, 1.0, 1.0); // material color (grayscale)
     
     gl_Position = u_MvpMatrix * a_Position;
     
     // Calculate a normal to be fit with a model matrix, and make it 1.0 in length
     vec3 normal = normalize(vec3(u_NormalMatrix * a_Normal));
     
     // Calculate world coordinate of vertex
     vec4 vertexPosition = u_ModelMatrix * a_Position;
     
     // Calculate the light direction and make it 1.0 in length
     vec3 lightDirection = normalize(u_LightPosition - vec3(vertexPosition));
     
     // The dot product of the light direction and the normal
     float nDotL = max(dot(lightDirection, normal), 0.0);
     
     // Calculate the color due to diffuse reflection
     vec3 diffuse = u_LightColor * color.rgb * nDotL;
     
     // Calculate the color due to ambient reflection
     vec3 ambient = u_AmbientLight * color.rgb;
     
     // Add the surface colors due to diffuse reflection and ambient reflection
     v_Color = vec4(diffuse + ambient, color.a);

     v_TexCoord = a_TexCoord; // send UV-coord to frag shader
}`;

var FSHADER_SOURCE = `#version 300 es
   precision highp float;
 
   uniform sampler2D u_image;
   in vec2 v_TexCoord; // interpolated UV-coord for this pixel
   in vec4 v_Color; // diffuse + ambient reflection (grayscale)
   out vec4 cg_FragColor;
   
   void main() {
     vec3 c = texture(u_image, v_TexCoord).rgb; // texel color on this UV-coord
     cg_FragColor = vec4(c * v_Color.r, 1.0); // combine with lighting
}`;

let config = {
    OBJECT: 0,  // which object
    ROTATE: false,  // rotate object?
    TEXTURE: 0,  // which texture image
    REPEAT_U: 1, // how many times texture map is repeated horizontally
    REPEAT_V: 1  // how many times texture map is repeated vertically
}

let gui = new dat.GUI({ width: 300 });
function startGUI() {
    gui.add(config, 'OBJECT', { 'Sphere': 0, 'Torus': 1, 'Cube': 2 }).name('object').onChange(update);
    gui.add(config, 'ROTATE').name('rotate?').onChange(update);
    gui.add(config, 'TEXTURE', {
        'Checker': 0, 'Gravel': 1, 'Wood': 2, 'Knit': 3,
        'Stained Glass': 4
    }).name('texture').onChange(update);
    gui.add(config, 'REPEAT_U', { '1': 1, '2': 2, '3': 3, '4': 4 }).name('repeat_u').onChange(update);
    gui.add(config, 'REPEAT_V', { '1': 1, '2': 2, '3': 3 }).name('repeat_v').onChange(update);
}
startGUI();

let gl, canvas;
let url = []; // url for each texture image
let vert = []; // number of indices for each object
let vao = [];
let modelMatrix;
let animID;

function update() {
    cancelAnimationFrame(animID); // to avoid duplicate requests
    loadImage();
}

function main() {
    // Retrieve <canvas> element
    canvas = document.getElementById('canvas');

    // Get the rendering context for WebGL
    gl = canvas.getContext('webgl2');

    // Initialize shaders
    initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE);

    // obtain urls for texture images
    url.push("http://www.cs.umsl.edu/~kang/htdocs/textures/checker.png");
    url.push("http://www.cs.umsl.edu/~kang/htdocs/textures/gravel.jpg");
    url.push("http://www.cs.umsl.edu/~kang/htdocs/textures/wood.jpg");
    url.push("http://www.cs.umsl.edu/~kang/htdocs/textures/knit.jpg");
    url.push("http://www.cs.umsl.edu/~kang/htdocs/textures/stained.jpg");

    modelMatrix = new Matrix4();  // Model matrix

    loadImage();
}

function loadImage() {
    var image = new Image();

    image.crossOrigin = "";
    image.src = url[config.TEXTURE];
    image.onload = function () {
        // set the vertex coordinates, normals, texcoords
        vert.push(generateSphere(gl));
        vert.push(generateTorus(gl));
        vert.push(generateCube(gl));

        textureSetup(gl, image); // set up texture parameters
        render(canvas, gl); // draw textured object
    };
}

function textureSetup(gl, image) {

    // Create a texture.
    var texture = gl.createTexture();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1); // Flip the image's y axis
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set the parameters so we can render any size image.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    // Upload the image into the texture.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    // Supply uniform texture sampler value as 0
    let u_Sampler = gl.getUniformLocation(gl.program, 'u_image');
    gl.uniform1i(u_Sampler, 0);
}

function render(canvas, gl) {

    // Set the clear color and enable the depth test
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);

    // Get the storage locations of uniform variables and so on
    var u_ModelMatrix = gl.getUniformLocation(gl.program, 'u_ModelMatrix');
    var u_MvpMatrix = gl.getUniformLocation(gl.program, 'u_MvpMatrix');
    var u_NormalMatrix = gl.getUniformLocation(gl.program, 'u_NormalMatrix');
    var u_LightColor = gl.getUniformLocation(gl.program, 'u_LightColor');
    var u_LightPosition = gl.getUniformLocation(gl.program, 'u_LightPosition');
    var u_AmbientLight = gl.getUniformLocation(gl.program, 'u_AmbientLight');

    // Set the light color (white)
    gl.uniform3f(u_LightColor, 0.8, 0.8, 0.8);
    // Set the light direction (in the world coordinate)
    gl.uniform3f(u_LightPosition, 5.0, 8.0, 7.0);
    // Set the ambient light
    gl.uniform3f(u_AmbientLight, 0.2, 0.2, 0.2);

    var mvpMatrix = new Matrix4(); // Model view projection matrix
    var normalMatrix = new Matrix4(); // Transformation matrix for normals

    function update() {
        if (config.ROTATE) {
            modelMatrix.rotate(0.2, 0, 1, 0); // y-roll
            modelMatrix.rotate(0.4, 1, 0, 0); // x-roll
        }

        // Calculate the view projection matrix
        mvpMatrix.setPerspective(30, canvas.width / canvas.height, 1, 100);
        mvpMatrix.lookAt(4, 5, 6, 0, 0, 0, 0, 1, 0);
        mvpMatrix.multiply(modelMatrix);
        // Pass the model view projection matrix to u_MvpMatrix
        gl.uniformMatrix4fv(u_MvpMatrix, false, mvpMatrix.elements);

        // Calculate the matrix to transform the normal based on the model matrix
        normalMatrix.setInverseOf(modelMatrix);
        normalMatrix.transpose();
        // Pass the transformation matrix for normals to u_NormalMatrix
        gl.uniformMatrix4fv(u_NormalMatrix, false, normalMatrix.elements);

        // Clear color and depth buffer
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // bind vertex array for current object
        gl.bindVertexArray(vao[config.OBJECT]);

        // Draw the cube(Note that the 3rd argument is the gl.UNSIGNED_SHORT)
        gl.drawElements(gl.TRIANGLES, vert[config.OBJECT], gl.UNSIGNED_SHORT, 0);

        if (config.ROTATE)
            animID = requestAnimationFrame(update);
    }
    update();
}

function initArrayBuffer(gl, attribute, data, type, num) {
    // Create a buffer object
    var buffer = gl.createBuffer();
    // Write date into the buffer object
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    // Assign the buffer object to the attribute variable
    var a_attribute = gl.getAttribLocation(gl.program, attribute);
    gl.vertexAttribPointer(a_attribute, num, type, false, 0, 0);
    // Enable the assignment of the buffer object to the attribute variable
    gl.enableVertexAttribArray(a_attribute);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    return true;
}

function generateSphere(gl) { // Create a sphere
    var RES = 50;
    let radius = 1.5;

    var i, ai, si, ci;
    var j, aj, sj, cj;
    var p1, p2;

    var positions = [];
    var texcoords = []; // UV texture coordinates
    var indices = [];

    // Generate coordinates
    for (j = 0; j <= RES; j++) { // vertical angle
        aj = j * Math.PI / RES;
        sj = Math.sin(aj);
        cj = Math.cos(aj);
        for (i = 0; i <= RES; i++) { // horizontal angle
            ai = i * 2 * Math.PI / RES;
            si = Math.sin(ai);
            ci = Math.cos(ai);

            positions.push(radius * si * sj);  // X
            positions.push(radius * cj);       // Y
            positions.push(radius * ci * sj);  // Z

            texcoords.push(i / RES * config.REPEAT_U); // u
            texcoords.push(j / RES * config.REPEAT_V); // v
        }
    }

    // Generate indices
    for (j = 0; j < RES; j++) {
        for (i = 0; i < RES; i++) {
            p1 = j * (RES + 1) + i;
            p2 = p1 + (RES + 1);

            indices.push(p1);
            indices.push(p2);
            indices.push(p1 + 1);

            indices.push(p1 + 1);
            indices.push(p2);
            indices.push(p2 + 1);
        }
    }

    vao[0] = gl.createVertexArray();
    gl.bindVertexArray(vao[0]);

    // Write the vertex properties to buffers (positions, normals, texcoords)
    initArrayBuffer(gl, 'a_Position', new Float32Array(positions), gl.FLOAT, 3);
    // for sphere, vertex normal is the same as vertex position
    initArrayBuffer(gl, 'a_Normal', new Float32Array(positions), gl.FLOAT, 3);
    initArrayBuffer(gl, 'a_TexCoord', new Float32Array(texcoords), gl.FLOAT, 2);

    // Unbind the buffer object
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Write the indices to the buffer object
    var indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null); // unbind this VAO

    return indices.length;
}

function generateTorus(gl) { // Create a torus
    const RES = 50; // (longitude lines + 1) or (latitude lines + 1)  
    let outRad = 2; // outer radius
    let inRad = 1.3; // inner radius
    let mRad = (inRad + outRad) / 2; // middle radius of torus
    let sRad = (outRad - inRad) / 2; // small radius of cross section

    let vertices = []; // 3D attribute variable for each vertex
    let normals = []; // 3D attribute variable for each vertex
    var texcoords = []; // 2D attribute variable for each vertex
    let indices = [];

    for (let j = 0; j <= RES; ++j) { // latitude lines
        let phi = j * (2 * Math.PI) / RES; // vertical angle [0, 360]
        let cosPhi = Math.cos(phi);
        let sinPhi = Math.sin(phi); // height of current latitude line

        for (let i = 0; i <= RES; ++i) { // longitude lines
            let theta = i * (2 * Math.PI) / RES; // horizontal angle [0, 360]
            let cosTheta = Math.cos(theta); // rotating from z to x axis
            let sinTheta = Math.sin(theta); // rotating from z to x axis

            let x = (mRad + sRad * cosPhi) * sinTheta;
            let y = sRad * sinPhi; // height of current latitude
            let z = (mRad + sRad * cosPhi) * cosTheta;

            vertices.push(x);
            vertices.push(y);
            vertices.push(z);

            let nx = x - (mRad * sinTheta);
            let ny = y;
            let nz = z - (mRad * cosTheta);

            normals.push(nx);
            normals.push(ny);
            normals.push(nz);

            texcoords.push(i / RES * config.REPEAT_U); // u
            texcoords.push(j / RES * config.REPEAT_V); // v
        }
    }

    // Calculate torus indices
    for (let j = 0; j < RES; ++j) {
        for (let i = 0; i < RES; ++i) {

            let down = j * (RES + 1) + i;
            let up = (j + 1) * (RES + 1) + i;

            // lower triangle of quadrangle cell
            indices.push(down);
            indices.push(down + 1);
            indices.push(up + 1);

            // upper triangle of quadrangle cell
            indices.push(up);
            indices.push(down);
            indices.push(up + 1);
        }
    }

    vao[1] = gl.createVertexArray();
    gl.bindVertexArray(vao[1]);

    // Write the vertex properties to buffers (vertex positions, normals, texcoords)
    initArrayBuffer(gl, 'a_Position', new Float32Array(vertices), gl.FLOAT, 3);
    initArrayBuffer(gl, 'a_Normal', new Float32Array(normals), gl.FLOAT, 3);
    initArrayBuffer(gl, 'a_TexCoord', new Float32Array(texcoords), gl.FLOAT, 2);

    // Unbind the buffer object
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Write the indices to the buffer object
    var indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null); // unbind this VAO

    return indices.length;
}

function generateCube(gl) {
    // Create a cube
    //    v6----- v5
    //   /|      /|
    //  v1------v0|
    //  | |     | |
    //  | |v7---|-|v4
    //  |/      |/
    //  v2------v3
    // Coordinates
    let vertices = [
        1.0, 1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, // v0-v1-v2-v3 front
        1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, // v0-v3-v4-v5 right
        1.0, 1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, // v0-v5-v6-v1 up
        -1.0, 1.0, 1.0, -1.0, 1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, // v1-v6-v7-v2 left
        -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, -1.0, -1.0, 1.0, // v7-v4-v3-v2 down
        1.0, -1.0, -1.0, -1.0, -1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0  // v4-v7-v6-v5 back
    ];

    // Normal
    let normals = [
        0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0,  // v0-v1-v2-v3 front
        1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0,  // v0-v3-v4-v5 right
        0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0,  // v0-v5-v6-v1 up
        -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0,  // v1-v6-v7-v2 left
        0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0,  // v7-v4-v3-v2 down
        0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0   // v4-v7-v6-v5 back
    ];

    // texture Coordinates
    let _u_ = config.REPEAT_U; // 1, 2, 3, ...
    let _v_ = config.REPEAT_V; // 1, 2, 3, ...
    let texcoords = [
        _u_, _v_, 0.0, _v_, 0.0, 0.0, _u_, 0.0, // v0-v1-v2-v3 front
        0.0, _v_, 0.0, 0.0, _u_, 0.0, _u_, _v_, // v0-v3-v4-v5 right
        _u_, 0.0, _u_, _v_, 0.0, _v_, 0.0, 0.0, // v0-v5-v6-v1 up
        _u_, _v_, 0.0, _v_, 0.0, 0.0, _u_, 0.0, // v1-v6-v7-v2 left
        0.0, 0.0, _u_, 0.0, _u_, _v_, 0.0, _v_, // v7-v4-v3-v2 down
        0.0, 0.0, _u_, 0.0, _u_, _v_, 0.0, _v_, // v4-v7-v6-v5 back
    ];

    // Indices of the vertices
    let indices = [
        0, 1, 2, 0, 2, 3,    // front
        4, 5, 6, 4, 6, 7,    // right
        8, 9, 10, 8, 10, 11,    // up
        12, 13, 14, 12, 14, 15,    // left
        16, 17, 18, 16, 18, 19,    // down
        20, 21, 22, 20, 22, 23     // back
    ];

    vao[2] = gl.createVertexArray();
    gl.bindVertexArray(vao[2]);

    // Write the vertex properties to buffers (positions, normals, texcoords)
    initArrayBuffer(gl, 'a_Position', new Float32Array(vertices), gl.FLOAT, 3);
    initArrayBuffer(gl, 'a_Normal', new Float32Array(normals), gl.FLOAT, 3);
    initArrayBuffer(gl, 'a_TexCoord', new Float32Array(texcoords), gl.FLOAT, 2);

    // Unbind the buffer object
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Write the indices to the buffer object
    var indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    gl.bindVertexArray(null); // unbind this VAO

    return indices.length;
}