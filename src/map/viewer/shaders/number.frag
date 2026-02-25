precision mediump float;

uniform sampler2D u_texture;

varying vec2 v_texCoord;
varying vec3 v_tintColor;
varying float v_alpha;

void main() {
  vec4 texColor = texture2D(u_texture, v_texCoord);

  // Simplified: Alpha is already calculated in vertex shader
  gl_FragColor = vec4(texColor.rgb * v_tintColor, texColor.a * v_alpha);
}
