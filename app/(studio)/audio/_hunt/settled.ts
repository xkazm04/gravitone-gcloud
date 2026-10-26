// Every island write on the hunt, rubric and strengths sections waits through the shared rule
// (../../../_server/settle.ts), so a rejected Server Action reads as the refusal it is.
// (The Arrange board's `answered` in ../_audio/Arrange.tsx is the same rule plus a deadline; these
// writes take none, because a drafting text engine may honestly take longer than any deadline.)
export { settle as settled } from "../../../_server/settle.ts";
