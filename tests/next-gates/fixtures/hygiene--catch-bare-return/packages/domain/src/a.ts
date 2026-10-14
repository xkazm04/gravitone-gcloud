export function a(): void {
  try {
    run();
  } catch (e) {
    return;
  }
}
declare function run(): void;
