// Client-bridge plug-in inside @local/dsh-extra-plan (no separate package).
//
// Purpose: a host-loadable, side-effect-free row whose loader name is a
// relative path (pathLike). clientModules' locatePkgJson treats pathLike
// rows differently from branded specifiers: it resolves the module and walks
// upward via nearestPackage to the enclosing package.json — here
// @local/dsh-extra-plan/package.json — reads the dsh.client declaration and
// loads exports["./client"] (lib/client.js, the settings card UI).
//
// v0.1.2-rc1's exactPackageSpecifier rejects subpath specifiers
// (@scope/pkg/subpath, e.g. @local/dsh-extra-plan/settings returns
// undefined and is skipped), which is why a bare name row or a subpath row
// cannot work. A relative-path row is scanned and always stays inside this
// package; nothing new is published.
export const name = 'dsh-extra-plan-client-bridge'
export const inject = []
export function apply() {
  // Intentionally empty — only the package.json dsh.client matters.
}
