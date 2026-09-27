/**
 * Kiwi Kifu - Visual Branch Tree Graph (Git / Sabaki Style)
 * Renders game variations as interactive visual lines and move dots.
 */

export class BranchGraph {
  constructor(containerEl, svgEl, options = {}) {
    this.container = containerEl;
    this.svg = svgEl;
    this.onSelectNode = options.onSelectNode || (() => {});
    this.onActionNode = options.onActionNode || (() => {});

    this.STEP_X = 22;
    this.LANE_Y = 16;
    this.PAD_X = 14;
    this.PAD_Y = 12;
  }

  computeLayout(rootNode) {
    const nodes = [];
    const edges = [];
    const laneOccupiedUntil = [];

    function walk(node, parentLane) {
      if (!node) return;

      let myLane;
      if (node === rootNode) {
        myLane = 0;
        laneOccupiedUntil[0] = 0;
      } else if (node.parent && node.parent.children[0] === node) {
        // Primary child inherits parent's lane
        myLane = parentLane;
        laneOccupiedUntil[myLane] = Math.max(laneOccupiedUntil[myLane] || 0, node.step);
      } else {
        // Variation child: find lowest available lane (>= 1) free at node.step
        let lane = 1;
        while (laneOccupiedUntil[lane] !== undefined && laneOccupiedUntil[lane] >= node.step) {
          lane++;
        }
        myLane = lane;
        laneOccupiedUntil[myLane] = node.step;
      }

      node._lane = myLane;
      nodes.push(node);

      if (node.parent) {
        edges.push({ from: node.parent, to: node });
      }

      if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
          walk(node.children[i], myLane);
        }
      }
    }

    walk(rootNode, 0);

    const maxStep = Math.max(0, ...nodes.map(n => n.step));
    const maxLane = Math.max(0, ...nodes.map(n => n._lane));

    return { nodes, edges, maxStep, maxLane };
  }

  render(game) {
    if (!this.svg) return;
    const { rootNode, currentNode, history } = game;
    if (!rootNode) return;

    const { nodes, edges, maxStep, maxLane } = this.computeLayout(rootNode);

    const totalWidth = Math.max(160, maxStep * this.STEP_X + this.PAD_X * 2);
    const totalHeight = Math.max(34, (maxLane + 1) * this.LANE_Y + this.PAD_Y * 2);

    this.svg.setAttribute('width', totalWidth);
    this.svg.setAttribute('height', totalHeight);
    this.svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);

    const activeSet = new Set(history);

    // 1. Build Edges (connecting lines and fork curves)
    let edgesSvg = '';
    for (const edge of edges) {
      const x1 = edge.from.step * this.STEP_X + this.PAD_X;
      const y1 = edge.from._lane * this.LANE_Y + this.PAD_Y;
      const x2 = edge.to.step * this.STEP_X + this.PAD_X;
      const y2 = edge.to._lane * this.LANE_Y + this.PAD_Y;

      const isActive = activeSet.has(edge.from) && activeSet.has(edge.to);
      const edgeClass = `branch-graph-edge ${isActive ? 'active' : ''}`;

      if (y1 === y2) {
        edgesSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${edgeClass}" />`;
      } else {
        const dx = x2 - x1;
        const cp1x = x1 + dx * 0.55;
        const cp1y = y1;
        const cp2x = x1 + dx * 0.35;
        const cp2y = y2;
        edgesSvg += `<path d="M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}" class="${edgeClass}" />`;
      }
    }

    // 2. Build Nodes (move dots)
    let nodesSvg = '';
    let activeRingSvg = '';

    for (const node of nodes) {
      const cx = node.step * this.STEP_X + this.PAD_X;
      const cy = node._lane * this.LANE_Y + this.PAD_Y;
      const isCurrent = node === currentNode;

      if (isCurrent) {
        activeRingSvg = `
          <g class="branch-graph-active-ring" style="transform-origin: ${cx}px ${cy}px;">
            <circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="#88C13F" stroke-width="2" />
          </g>
        `;
      }

      if (node.step === 0) {
        nodesSvg += `
          <g class="branch-graph-node-group" data-node-id="${node.id}" style="transform-origin: ${cx}px ${cy}px;">
            <circle cx="${cx}" cy="${cy}" r="4" fill="rgba(255,255,255,0.45)" stroke="#666" stroke-width="1.2" class="branch-graph-node ${isCurrent ? 'current' : ''}">
              <title>Start (Root)</title>
            </circle>
          </g>
        `;
      } else {
        const isBlack = node.player === 1;
        const fill = isBlack ? '#18181b' : '#f4f4f5';
        const stroke = isBlack ? 'rgba(255,255,255,0.45)' : '#71717a';
        const title = `Move #${node.step} (${isBlack ? 'Black' : 'White'})`;

        nodesSvg += `
          <g class="branch-graph-node-group" data-node-id="${node.id}" style="transform-origin: ${cx}px ${cy}px;">
            <circle cx="${cx}" cy="${cy}" r="5.2" fill="${fill}" stroke="${stroke}" stroke-width="1.2" class="branch-graph-node ${isCurrent ? 'current' : ''}">
              <title>${title}</title>
            </circle>
          </g>
        `;
      }
    }

    this.svg.innerHTML = `
      <g class="branch-graph-edges">${edgesSvg}</g>
      <g class="branch-graph-rings">${activeRingSvg}</g>
      <g class="branch-graph-nodes">${nodesSvg}</g>
    `;

    // Attach listeners
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const groups = this.svg.querySelectorAll('.branch-graph-node-group');
    groups.forEach(g => {
      const id = parseInt(g.getAttribute('data-node-id'), 10);
      const node = nodeMap.get(id);
      if (!node) return;

      g.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onSelectNode(node);
      });

      let timer = null;
      g.addEventListener('pointerdown', () => {
        timer = setTimeout(() => {
          this.onActionNode(node);
        }, 450);
      });
      const cancel = () => clearTimeout(timer);
      g.addEventListener('pointerup', cancel);
      g.addEventListener('pointercancel', cancel);
      g.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.onActionNode(node);
      });
    });

    // Auto-scroll to active node
    if (currentNode && this.container) {
      const currentX = currentNode.step * this.STEP_X + this.PAD_X;
      const targetScroll = Math.max(0, currentX - this.container.clientWidth / 2);
      this.container.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  }
}
