precision mediump float;

uniform sampler2D u_texture;
uniform vec3 u_tintColor;
uniform float u_tintStrength;
uniform vec3 u_glowColor;
uniform float u_useFlatColor;

varying vec2 v_texCoord;
varying vec2 v_localTexCoord;
varying float v_glow;
varying float v_bright;
varying vec3 v_color;

void main() {
  vec4 texColor = texture2D(u_texture, v_texCoord);
  
  // Mathematical hexagon alpha (pointy top)
  // Quad is 0..1. Hex center 0.5, 0.5.
  float dx = abs(v_localTexCoord.x - 0.5);
  float dy = abs(v_localTexCoord.y - 0.5);
  
  // A bit more generous hex check (48% width, 50% height)
  bool inHex = (dx < 0.48) && (dy + dx * 0.5 < 0.5);
  float hexAlpha = inHex ? 1.0 : 0.0;

  // Strict binary toggle based on u_useFlatColor
  vec4 flatColor = vec4(v_color, hexAlpha);
  vec4 baseColor = (u_useFlatColor > 0.5) ? flatColor : texColor;

  // Apply player tint and effects
  vec3 color = mix(baseColor.rgb, u_tintColor * baseColor.rgb, u_tintStrength);
  color = mix(color, u_glowColor, v_glow * 0.3);
  color = mix(color, vec3(1.0), v_bright * 0.28);

  gl_FragColor = vec4(color, baseColor.a);
}
