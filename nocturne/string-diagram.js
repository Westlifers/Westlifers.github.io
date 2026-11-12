/* Shared by Hexo and the browser: the first frame and interactive frames use
   exactly the same drawing. Geometry comes from the exported DisCoCat graph. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NocturneStringDiagram = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
  const number = value => Number(value.toFixed(3));

  // Dedicated spacing for “The city I watch is full of other people's evenings.”
  // Keep port order and cap/swap incidence while shaping this sentence's curves.
  const wordWidths = [68, 82, 35, 108, 112, 92, 55, 105, 114, 76, 155];
  function layout(sentence) {
    const anchors = [];
    let cursor = 28;
    for (const [index, word] of sentence.words.entries()) {
      const width = wordWidths[index];
      anchors.push([word.x, cursor], [word.x + word.width, cursor + width]);
      cursor += width + 18;
    }
    const width = cursor + 11;
    function x(value) {
      let a = anchors[0], b = anchors[1];
      if (value > anchors[anchors.length - 1][0]) {
        a = anchors[anchors.length - 2]; b = anchors[anchors.length - 1];
      } else {
        for (let i = 1; i < anchors.length; i++) {
          b = anchors[i];
          if (value <= b[0]) { a = anchors[i - 1]; break; }
        }
      }
      return number(a[1] + (value - a[0]) / Math.max(.00001, b[0] - a[0]) * (b[1] - a[1]));
    }
    const top = 32, wordHeight = 62, lower = 405;
    const boxBottom = Math.max(...sentence.words.map(word => word.y + word.height));
    const bottom = sentence.bounds.y + sentence.bounds.height;
    const y = value => number(value <= boxBottom ? top + value / boxBottom * wordHeight : top + wordHeight + (value - boxBottom) / Math.max(.1, bottom - boxBottom) * (lower - top - wordHeight));
    const floor = y(5.25), shoulder = y(4.5), k = .55228475;
    const leftLow = (x(.5) + x(8)) / 2, rightLow = (x(10.5) + x(18)) / 2;
    // The swap lives at the natural intersection of two uninterrupted sweeps.
    // Internal helper coordinates are presentation anchors, not word endpoints.
    const sweeps = {
      rising: [[leftLow,floor], [leftLow+110,floor], [x(15.5),y(3.75)], [x(15.5),y(2.1)]],
      falling: [[x(3),y(2.85)], [x(3),y(4.55)], [rightLow-88,floor], [rightLow,floor]]
    };
    const onCurve = (points, t) => [0,1].map(axis => {
      const u = 1-t;
      return u*u*u*points[0][axis] + 3*u*u*t*points[1][axis] + 3*u*t*t*points[2][axis] + t*t*t*points[3][axis];
    });
    const helperPosition = (kind, port) => kind === 'Swap'
      ? port.type === 'n.r' ? onCurve(sweeps.rising,.22) : onCurve(sweeps.falling,.85)
      : [x(port.x),y(port.y)];
    const commands = strand => {
      const original = strand.commands.map(command => ({ op: command.op, points: command.points.map(point => [x(point[0]), y(point[1])]) }));
      if (strand.id === 'strand-4') return original;
      if (strand.id === 'strand-0' || strand.id === 'strand-3') {
        const start = original[0].points[0], end = original.at(-1).points.at(-1);
        const upper = y(3.25);
        const result = [{ op:'M', points:[start] }];
        let cursor = start;
        const curve = (a, b, point) => {
          result.push({ op:'C', points:[a,b,point] });
          cursor = point;
        };
        const line = point => curve(
          cursor.map((value, axis) => value + (point[axis] - value) / 3),
          cursor.map((value, axis) => value + (point[axis] - value) * 2 / 3), point);
        const dip = (point, level) => {
          const from = cursor, half = (point[0] - from[0]) / 2, middle = from[0] + half;
          curve([from[0],from[1]+k*(level-from[1])], [middle-k*half,level], [middle,level]);
          curve([middle+k*half,level], [point[0],point[1]+k*(level-point[1])], point);
        };
        // Keep the small cap and the cup minima. Each arm now turns only once,
        // so the crossing needs no separate horizontal or vertical neck.
        if (strand.id === 'strand-0') {
          const left = start[0];
          line([left,shoulder]);
          curve([left,shoulder+k*(floor-shoulder)], [leftLow-k*(leftLow-left),floor], sweeps.rising[0]);
          curve(...sweeps.rising.slice(1));
          line(end);
        } else {
          const right = start[0], capRight = x(5.5), capLeft = x(3), capFoot = y(2.5), capTop = y(2.25);
          const capMiddle = (capLeft+capRight)/2, half = (capRight-capLeft)/2, rise = capFoot-capTop;
          line([right,capFoot]);
          dip([capRight,capFoot],upper);
          curve([capRight,capFoot-k*rise], [capMiddle+k*half,capTop], [capMiddle,capTop]);
          curve([capMiddle-k*half,capTop], [capLeft,capFoot-k*rise], [capLeft,capFoot]);
          line(sweeps.falling[0]);
          curve(...sweeps.falling.slice(1));
          curve([rightLow+k*(end[0]-rightLow),floor], [end[0],shoulder+k*(floor-shoulder)], [end[0],shoulder]);
          line(end);
        }
        return result;
      }
      // The nine simple cups form continuous hanging curves.
      const start = original[0].points[0], end = original.at(-1).points.at(-1);
      const low = Math.max(...original.flatMap(command => command.points.map(point => point[1])));
      const middle = [(start[0] + end[0]) / 2, low];
      const span = end[0] - start[0], depth = low - start[1];
      return [{ op:'M', points:[start] },
        { op:'C', points:[[start[0], start[1] + depth * .86], [middle[0] - span * .32, low], middle] },
        { op:'C', points:[[middle[0] + span * .32, low], [end[0], end[1] + depth * .86], end] }];
    };
    const path = strand => commands(strand).map(command => command.op + command.points.map(point => number(point[0]) + ',' + number(point[1])).join(' ')).join(' ');
    return { width, height: 456, x, y, path, commands, helperPosition };
  }

  function render(sentence, { interactive = false } = {}) {
    const project = layout(sentence), { width, height, x, y } = project;
    const prefix = 'string-' + sentence.id;
    const palette = [['#8b9fbf','#e0e8f4','#a695af'],['#c9c7d5','#a2b5d8','#e9e2dc'],['#b7bfd2','#e7e7ec','#8899b7']];
    const defs = sentence.strands.map((strand, index) => {
      const colors = strand.role === 'sentence' ? ['#f4d6a9','#f5d7b4','#dca56c'] : palette[index % palette.length];
      const points = project.commands(strand).flatMap(command => command.points);
      const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
      const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
      // SVG ignores objectBoundingBox paint on a zero-width/height path. The
      // vertical s output must paint during inscription, not first appear when
      // its solid specular layer returns at the end of the entrance animation.
      const coordinates = left === right || top === bottom
        ? `gradientUnits="userSpaceOnUse" x1="${left}" y1="${top}" x2="${right}" y2="${bottom === top && left === right ? bottom + 1 : bottom}"`
        : 'x1="0" y1="0" x2="1" y2="1"';
      return `<linearGradient id="${prefix}-g${index}" ${coordinates}><stop stop-color="${colors[0]}"/><stop offset=".55" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient>`;
    }).join('');
    const paths = sentence.strands.map((strand, index) => {
      const d = project.path(strand);
      return `<g class="string-strand ${strand.role === 'sentence' ? 'string-strand--sentence' : ''}" data-words="${escape(strand.wordIds.join(' '))}" data-strand="${escape(strand.id)}" style="--strand-delay:-${(index * 2.7).toFixed(1)}s;--strand-time:${24 + index % 4 * 4}s;--ink-delay:${(index * .055).toFixed(3)}s"><path class="string-halo" d="${d}" stroke="url(#${prefix}-g${index})"/><path class="string-thread" d="${d}" pathLength="1000" stroke="url(#${prefix}-g${index})"/><path class="string-specular" d="${d}"/><path class="string-flow" d="${d}" pathLength="1000"/><path class="string-signal" d="${d}" pathLength="1000"/></g>`;
    }).join('');
    const words = sentence.words.map(word => {
      const left = x(word.x), right = x(word.x + word.width), top = y(word.y), bottom = y(word.y + word.height);
      const center = number((left + right) / 2);
      const ports = word.ports.map(port => `<circle class="string-port" cx="${x(port.x)}" cy="${y(port.y)}" r="1.7"/><text class="string-type" x="${x(port.x)}" y="${y(port.y) + 20}" text-anchor="middle">${escape(port.type.replace(/\.r/g,'ʳ').replace(/\.l/g,'ˡ'))}</text>`).join('');
      return `<g class="string-word" data-word="${escape(word.id)}"${interactive ? ` role="button" tabindex="0" aria-label="查看 ${escape(word.text)} 的连线" aria-pressed="false"` : ''}><rect class="string-word-hit" x="${left - 5}" y="${top - 7}" width="${number(right-left+10)}" height="${number(bottom-top+14)}"/><ellipse class="string-word-aura" cx="${center}" cy="${bottom - 13}" rx="${number((right-left)*.7)}" ry="30" fill="url(#${prefix}-wordlight)"/><path class="string-word-anchor" d="M${left + 3} ${bottom}H${right - 3}"/><path class="string-word-focus" d="M${left + 5} ${top - 4}h12 M${right - 5} ${top - 4}h-12 M${left + 5} ${bottom + 7}h12 M${right - 5} ${bottom + 7}h-12"/><text class="string-word-label" x="${center}" y="${bottom - 21}" text-anchor="middle" lang="en">${escape(word.text)}</text>${ports}</g>`;
    }).join('');
    const helperTypes = sentence.helpers.filter(helper => helper.kind === 'Cap' || helper.kind === 'Swap').flatMap(helper => helper.ports.filter(port => port.kind === 'cod').map(port => {
      const position = project.helperPosition(helper.kind, port);
      return `<text class="string-type" x="${number(position[0]+5)}" y="${number(position[1]+15)}">${escape(port.type.replace(/\.r/g,'ʳ').replace(/\.l/g,'ˡ'))}</text>`;
    })).join('');
    const outputs = sentence.outputs.map(port => `<g class="string-output"><circle class="string-output-light" cx="${x(port.x)}" cy="${y(port.y)}" r="25" fill="url(#${prefix}-wordlight)"/><circle cx="${x(port.x)}" cy="${y(port.y)}" r="2.6"/><text x="${x(port.x)}" y="${y(port.y) + 31}" text-anchor="middle">${escape(port.type)}</text></g>`).join('');
    return `<svg class="string-diagram" viewBox="0 0 ${width} ${height}" style="--diagram-width:${width}px" xmlns="http://www.w3.org/2000/svg" role="${interactive ? 'group' : 'img'}" aria-labelledby="${prefix}-title ${prefix}-desc" data-scene="${escape(sentence.id)}"><title id="${prefix}-title">${escape(sentence.sentence)}</title><desc id="${prefix}-desc">这句话的一种 DisCoCat 分析。词语之间的线保留原始类型连接；末端 s 为句子类型。</desc><defs>${defs}<radialGradient id="${prefix}-wordlight"><stop stop-color="#e6bd91" stop-opacity=".6"/><stop offset=".35" stop-color="#aa7c87" stop-opacity=".18"/><stop offset="1" stop-color="#aa7c87" stop-opacity="0"/></radialGradient><filter id="${prefix}-glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4"/></filter></defs><g class="string-paths" style="--string-glow:url(#${prefix}-glow)">${paths}</g><g class="string-words">${words}</g>${helperTypes}${outputs}</svg>`;
  }
  return { render, layout };
});
