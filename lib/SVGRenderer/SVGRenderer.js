'use strict';

const path = require('path');
const fs = require('fs');
const jsdom = require('jsdom');
const cheerio = require('cheerio');
const d3 = require('d3');
const MathJaxRenderer = require('app/lib/MathJaxRenderer');
const SVGstyles = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const SVGscripts = fs.readFileSync(path.join(__dirname, 'scripts.js'), 'utf8');

module.exports = class SVGRenderer {
  static renderSVG({ data, renderFormula: renderFormula = false }, callback) {
    jsdom.env({
      html: '',
      features: { QuerySelector: true },
      scripts: ['http://code.jquery.com/jquery.js'],
      done(jsdomErr, window) {
        if (jsdomErr) callback(jsdomErr, null);
        window.d3 = d3.select(window.document);
        const defaults = {
          maxWidth: 30,
          strokeWidth: 2
        };

        // set the dimensions and margins of the diagram
        const margin = {
          top: defaults.maxWidth / 2 + defaults.strokeWidth,
          right: defaults.maxWidth / 2 + defaults.strokeWidth,
          bottom: defaults.maxWidth / 2 + defaults.strokeWidth,
          left: defaults.maxWidth / 2 + defaults.strokeWidth
        };
        const width = 660 - margin.left - margin.right;
        const height = 550 - margin.top - margin.bottom;

        // declares a tree layout and assigns the size
        const treemap = d3.tree()
                          .size([width, height]);

        //  assigns the data to a hierarchy using parent-child relationships
        let nodes = d3.hierarchy(data);

        // maps the node data to the tree layout
        nodes = treemap(nodes);

        const svg = window.d3.select('body')
        .append('container').attr('class', 'container')
        .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewbox', `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .attr('class', 'mainSVG')
        .attr('xmlns', 'http://www.w3.org/2000/svg');
        const styles = svg.append('style').text(SVGstyles);
        const script = svg.append('script').html(SVGscripts).attr('type', 'text/javascript');
        const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`)
        .attr('class', 'mainWrapper');

        // adds the links between the nodes
        g.selectAll('.link')
          .data(nodes.descendants().slice(1))
          .enter().append('path')
          .attr('class', 'link')
          .attr('d', (d) => {
            return 'M' + d.x + ',' + d.y
            + 'C' + d.x + ',' + (d.y + d.parent.y) / 2
            + ' ' + d.parent.x + ',' + (d.y + d.parent.y) / 2
            + ' ' + d.parent.x + ',' + d.parent.y;
          });

        // adds each node as a group
        const node = g.selectAll('.node')
        .data(nodes.descendants())
        .enter().append('g')
        .attr('class', d => 'node' + (d.children ? ' node--internal' : ' node--leaf'))
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .attr('data-xref', d => d.data.id)

        const mathJaxRenderings = [];
        // add rect and MathJaxSVG to all nodes
        node.each(function(d) {
          mathJaxRenderings.push(new Promise((resolve, reject) => {
            MathJaxRenderer.renderMML(d.data.nodePresentation, (mathjaxErr, mmlSVG) => {
              if (mathjaxErr) reject(mathjaxErr);
              const $ = cheerio.load(mmlSVG);

              const mmlWidth = $('svg').attr('width').substring(0, $('svg').attr('width').length - 2);
              const mmlHeight = $('svg').attr('height').substring(0, $('svg').attr('height').length - 2);
              const width = (mmlWidth * 9) > 30 ? mmlWidth * 9 : 30;
              const height = (mmlHeight * 9) > 30 ? mmlHeight * 9 : 30;

              d3.select(this).append('rect')
              .attr('width', width)
              .attr('height', height)
              .attr('rx', 7)
              .attr('ry', 7)
              .attr('transform', `translate(${-width / 2}, ${-height / 2})`);

              d3.select(this).append('g')
              // TODO Fix conversion from ex to pixels
              .attr('transform', `translate(${-mmlWidth * 4},${-mmlHeight * 4})`)
              .html(mmlSVG);
              resolve();
            });
          }));
        });
        if (renderFormula) {
          mathJaxRenderings.push(
            new Promise((resolve, reject) => {
              MathJaxRenderer.renderMML(data.presentation, (err, entireFormula) => {
                if (err) reject(err);
                window.d3.select('.mainSVG')
                .append('g')
                .attr('transform', 'translate(0,0)')
                .attr('class', 'formula')
                .html(entireFormula);
                resolve();
              });
            })
          );
        }
        Promise.all(mathJaxRenderings).then(() => {
          callback(null, window.d3.select('.container').html());
        }).catch((err) => {
          callback(err, null);
        });
      }
    });
  }
};