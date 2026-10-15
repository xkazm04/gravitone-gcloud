// CSS Modules as the type checker sees them. Next (and Vitest) resolve the class map at build;
// tsc only needs to know a module stylesheet default-exports a map of class names.
declare module "*.module.css" {
  const classes: { readonly [name: string]: string };
  export default classes;
}
