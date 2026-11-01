# Third-party notices

The plugin's own code is MIT licensed (see `LICENSE`). This does not relicense the software
embedded in `main.js`: a Web Worker bundle built from the packages below, at the versions locked
in `package-lock.json`. Nothing else is embedded; the renderer's `dist/runtime.js` (the Node host)
is not used, and OpenChemLib's debug build and `resources.json` are not included.

## SMILES renderer

[smiles-renderer](https://github.com/Reonarudo/smiles-renderer) 1.0.0 (MIT, copyright (c) 2026
Leonardo Marques) supplies `compose`, which sanitizes each OpenChemLib SVG against an allowlist
and composes the output root. The plugin's worker entry ports its `worker.ts`, and the host ports
its `runtime.ts`. Its own `THIRD_PARTY_NOTICES.md` and `licenses/` directory, in
`node_modules/@reonarudo/smiles-renderer/`, give its dependencies' provenance.

## OpenChemLib

`openchemlib` 9.25.0, the JavaScript build of OpenChemLib by Actelion Pharmaceuticals Ltd and the
cheminfo contributors, parses SMILES and SMARTS, generates 2D coordinates and depicts each
structure as SVG. Upstream: <https://github.com/cheminfo/openchemlib-js> (JavaScript build) and
<https://github.com/Actelion/openchemlib> (Java source). It is distributed under the BSD 3-Clause
License:

```text

Copyright (c) 2015-2017, cheminfo

All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.
    * Neither the name of {{ project }} nor the names of its contributors
      may be used to endorse or promote products derived from this software
      without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## xmldom

[`@xmldom/xmldom`](https://github.com/xmldom/xmldom) 0.9.12, used by the renderer's sanitizer to
parse OpenChemLib's SVG, is distributed under the MIT License:

```text
Copyright 2019 - present Christopher J. Brody and other contributors, as listed in: https://github.com/xmldom/xmldom/graphs/contributors
Copyright 2012 - 2017 @jindw <jindw@xidea.org> and other contributors, as listed in: https://github.com/jindw/xmldom/graphs/contributors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
