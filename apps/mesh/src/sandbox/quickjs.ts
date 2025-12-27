import variant from "@jitl/quickjs-wasmfile-release-sync";
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSWASMModule,
} from "quickjs-emscripten-core";

let quickJSSingleton: Promise<QuickJSWASMModule> | undefined;

export function getQuickJS() {
  quickJSSingleton ??= newQuickJSWASMModuleFromVariant(variant);
  return quickJSSingleton;
}
