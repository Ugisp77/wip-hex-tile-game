// Helper to load shader source files
export async function loadShaderSource(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load shader: ${path}`);
    }
    return await response.text();
}
