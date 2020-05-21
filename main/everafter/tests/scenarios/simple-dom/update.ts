// import type {
//   SimpleComment,
//   SimpleElement,
//   SimpleNode,
//   SimpleText,
// } from "@simple-dom/interface";
// import { caller, effect, PARENT, Updater, Var } from "everafter";
// import type { DomAttr } from "./output";

// export function attrUpdate(
//   element: SimpleElement,
//   attr: DomAttr,
//   source = caller(PARENT)
// ): Updater {
//   return effect(() => {
//     if (attr.ns) {
//       element.setAttributeNS(
//         attr.ns.current,
//         attr.name.current,
//         attr.value.current
//       );
//     } else {
//       element.setAttribute(attr.name.current, attr.value.current);
//     }
//   }, source);
// }

// export function nodeValueUpdate(
//   node: SimpleText | SimpleComment,
//   value: Var<string>,
//   source = caller(PARENT)
// ): Updater {
//   return effect(() => {
//     node.nodeValue = value.current;
//   }, source);
// }

// export function nodeUpdate(node: SimpleNode, value: Var<SimpleNode>): Updater {
//   return effect(() => {
//     let newNode = value.current;

//     let parent = node.parentNode;

//     if (parent === null) {
//       throw new Error(`invariant: attempted to replace a detached node`);
//     }

//     let nextSibling = node.nextSibling;
//     parent.removeChild(node);

//     parent.insertBefore(newNode, nextSibling);
//   });
// }

export {};
