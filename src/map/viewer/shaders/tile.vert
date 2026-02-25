attribute vec2 a_position;
attribute vec2 a_texCoord;
attribute vec2 a_tilePos;
attribute vec2 a_tileSize;
attribute float a_lift;
attribute float a_glow;
attribute float a_bright;
attribute float a_texIndex;
attribute vec3 a_color;

uniform mat3 u_matrix;
uniform vec2 u_atlasSize;
uniform vec2 u_tileTexSize;

varying vec2 v_texCoord;
varying vec2 v_localTexCoord;
varying float v_glow;
varying float v_bright;
varying vec3 v_color;

void main() {
  // Apply lift to Y position
  vec2 worldPos = a_tilePos + a_position * a_tileSize;
  worldPos.y -= a_lift;

  // Transform to clip space
  vec2 clipSpace = (u_matrix * vec3(worldPos, 1.0)).xy;
  gl_Position = vec4(clipSpace, 0.0, 1.0);

  // Calculate texture coordinates in atlas
  float tilesPerRow = floor(u_atlasSize.x / u_tileTexSize.x + 0.5);
  vec2 tileOffset = vec2(mod(a_texIndex + 0.001, tilesPerRow),
                         floor((a_texIndex + 0.001) / tilesPerRow));
  vec2 atlasCoord = (tileOffset * u_tileTexSize + a_texCoord * u_tileTexSize) / u_atlasSize;

  v_texCoord = atlasCoord;
  v_localTexCoord = a_texCoord;
  v_glow = a_glow;
  v_bright = a_bright;
  v_color = a_color;
}
