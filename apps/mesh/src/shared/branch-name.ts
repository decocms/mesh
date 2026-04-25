// TEMPORARY: re-export from the new server-side location so client code keeps
// compiling while it migrates. Removed in the final cleanup task once no
// client file imports this module.
export { generateBranchName } from "../tools/thread/branch-name";
