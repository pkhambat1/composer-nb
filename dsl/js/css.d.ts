// A stylesheet imported with ?inline: Vite hands over its text, for the npm build to carry
// inside the module (music.ts)
declare module "*.css?inline" {
  const css: string
  export default css
}
