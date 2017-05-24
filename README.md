# RenderMath 3

This implementation of RenderMath uses the [mathjax-node
library](https://github.com/mathjax/mathjax-node).



## Development

```
git clone https://github.com/ncbi/rendermath3.git
cd rendermath3
npm install
node index.js
```





## index.js

Server listens for POST requests containing MathJax configuration and math as a string. Returns rendered math.

The input math string can be in LaTeX or MathML. The output rendering can be SVG, PNG, or MathML. Additionally, you can specify that speech text rendering is added as alt text.

See the documentation for Mathjax-node for more information on PNG outputs.

The JSON data to post to the server contains the following keys.

- `format`: Specifies the format of the math you are sending. Values can be `MathML`, `TeX`, or `inline-TeX`.
- `math`: Specifies the math expression to be rendered.
- `svg`: Specifies whether to return the math rendered as an SVG image.
- `mml`: Specifies whether to return the math rendered in MathML.
- `png`: Specifies whether to return the math rendered as a PNG image.
- `dpi`: Specifies the dpi for the image when requesting PNG.
- `speakText`: Specifies whether to provide a readable version of the math as `alt` text in the rendered version.
- `ex`: Specifies x-height in pixels.
- `width`: Specifies maximum width for rendered image.
- `linebreaks`: Specifies whether to allow lines to break.


## To do

* The original version of mathjax-server let you output PNG or MathML in
  addition to SVG. It even had speech output! Can we get those back in
  easily?
