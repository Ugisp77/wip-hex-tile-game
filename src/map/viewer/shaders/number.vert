attribute vec2 a_position;
attribute vec2 a_texCoord;
attribute vec2 a_tilePos;
attribute vec2 a_tileSize;
attribute float a_texIndex;
attribute vec3 a_tintColor;

uniform mat3 u_matrix;
uniform vec2 u_atlasSize;
uniform vec2 u_tileTexSize;
uniform vec2 u_mouseWorld;
uniform float u_fadeInner;
uniform float u_fadeOuter;

varying vec2 v_texCoord;
varying vec3 v_tintColor;
varying float v_alpha;

void main() {
  vec2 worldPos = a_tilePos + a_position * a_tileSize;

  vec2 clipSpace = (u_matrix * vec3(worldPos, 1.0)).xy;
  gl_Position = vec4(clipSpace, 0.0, 1.0);

  // Dist-based fading moved back to fragment for better visual quality
  // While we fix the "broken" status.
  float d = distance(worldPos, u_mouseWorld);
  float alpha = 1.0;
  if (d >= u_fadeOuter) {
    alpha = 0.0;
  } else if (d > u_fadeInner) {
    float t = (d - u_fadeInner) / (u_fadeOuter - u_fadeInner);
    alpha = 1.0 - (t * t * (3.0 - 2.0 * t)); // smoothstep
  }

  vec2 tileOffset = vec2(mod(a_texIndex, u_atlasSize.x / u_tileTexSize.x),
                         floor(a_texIndex / (u_atlasSize.x / u_tileTexSize.x)));
  vec2 atlasCoord = (tileOffset * u_tileTexSize + a_texCoord * u_tileTexSize) / u_atlasSize;

  v_texCoord = atlasCoord;
  v_tintColor = a_tintColor;
  v_alpha = alpha;
}
