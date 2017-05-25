# RenderMath 3

This implementation of RenderMath uses the [mathjax-node
library](https://github.com/mathjax/mathjax-node).



To run it:

```
git clone https://github.com/ncbi/rendermath3.git
cd rendermath3
npm install
node index.js
```

## API

Make requests to the service with either GET or POST. When making POST
requests, the parameters must be encoded as x-www-form-urlencoded.

The parameters this service understands are:

* `q` - The content of the math formula or JATS file
* `in-format` - One of 'latex', 'mml', 'jats', or 'auto'. The default is
  'auto'.
* `latex-style` - If the input is a LaTeX formula, this specifies whether
  it should be rendered in text (inline) or display (block) mode
* `width` - Maximum width for the equations

Note that MathML can be provided with a namespace prefix or without one.
But, if it is provided with a namespace prefix, then that prefix
***must be "mml:"***. No other namespace prefix will work.


## To do

* The original version of mathjax-server let you output PNG or MathML in
  addition to SVG. It even had speech output! Can we get those back in
  easily?
* Should we allow specifying "x-height" for the image?
