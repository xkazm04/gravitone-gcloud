export function a(): void {
  try {
    run();
  } catch (e) {
    console.error(e);
  }
}
declare function run(): void;
