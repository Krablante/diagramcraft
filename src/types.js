// Type definitions shared across modules. This file has no runtime code.
// @ts-check

/**
 * @typedef {"terminal"|"process"|"decision"|"data"|"document"|"database"|"connector"|"note"|"junction"} NodeKind
 * @typedef {"solid"|"dashed"|"dotted"} EdgeKind
 * @typedef {"end"|"both"|"none"} ArrowKind
 * @typedef {"TB"|"LR"|"RL"|"BT"} Direction
 */

/**
 * @typedef {object} SpecNode
 * @property {string} id
 * @property {string} label
 * @property {NodeKind} kind
 * @property {string|null} note
 * @property {boolean} accent
 * @property {string|null} color
 * @property {number|null} maxWidth
 * @property {number|null} width
 * @property {number|null} height
 */

/**
 * @typedef {object} SpecEdge
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {string|null} label
 * @property {EdgeKind} kind
 * @property {ArrowKind} arrow
 * @property {string|null} color
 */

/**
 * @typedef {object} SpecGroup
 * @property {string} id
 * @property {string} label
 * @property {string[]} nodes
 * @property {string|null} color
 */

/**
 * @typedef {object} Spec
 * @property {number} version
 * @property {string|null} title
 * @property {string|null} subtitle
 * @property {string|null} footer
 * @property {string} theme
 * @property {Direction} direction
 * @property {{nodeGap?:number, rankGap?:number, edgeGap?:number}} layout
 * @property {object|null} style
 * @property {{formats?:string[], scale?:number, transparent?:boolean, charset?:string}} output
 * @property {SpecNode[]} nodes
 * @property {SpecEdge[]} edges
 * @property {SpecGroup[]} groups
 */

/**
 * @typedef {object} SpecIssue
 * @property {string} path
 * @property {string} message
 */

/**
 * @typedef {object} FontToken
 * @property {string} family
 * @property {number} size
 * @property {number} weight
 * @property {string} color
 * @property {number} [lineHeight]
 * @property {number} [spacing]
 * @property {boolean} [uppercase]
 */

/**
 * @typedef {object} Paint
 * @property {"solid"|"linear"|"radial"} type
 * @property {string} [color]
 * @property {number} [angle]
 * @property {number[]} [center]
 * @property {number} [radius]
 * @property {Array<[number,string]>} [stops]
 */

/**
 * @typedef {object} Stroke
 * @property {string} color
 * @property {number} width
 * @property {number[]|null} [dash]
 */

/**
 * @typedef {object} Shadow
 * @property {string} color
 * @property {number} opacity
 * @property {number} blur
 * @property {number} y
 * @property {number} [x]
 */

/**
 * @typedef {object} Theme
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string[]} tags
 * @property {number} order
 * @property {object} canvas
 * @property {Record<string, FontToken>} fonts
 * @property {object} node
 * @property {object} edge
 * @property {object} zone
 * @property {object} heading
 * @property {object} footer
 * @property {{nodeGap:number, rankGap:number, edgeGap:number, edgeLabelGap:number}} layout
 */

/**
 * @typedef {object} ModelNode
 * @property {string} id
 * @property {NodeKind} kind
 * @property {object} labelFont
 * @property {string[]} lines
 * @property {string[]} noteLines
 * @property {boolean} accent
 * @property {string|null} color
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {object} ModelEdge
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {EdgeKind} kind
 * @property {ArrowKind} arrow
 * @property {string|null} color
 * @property {string|null} label
 * @property {number[][][]} paths
 * @property {{x:number,y:number,w:number,h:number}|null} labelBox
 */

/**
 * @typedef {object} ModelZone
 * @property {string} id
 * @property {string} label
 * @property {string|null} color
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {object} Model
 * @property {number} width
 * @property {number} height
 * @property {ModelNode[]} nodes
 * @property {ModelEdge[]} edges
 * @property {ModelZone[]} zones
 */

export {};
