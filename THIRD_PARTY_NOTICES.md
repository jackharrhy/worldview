# Third-party notices

Worldview contains code adapted from the IdTech2/GoldSrc renderer in
[noclip.website](https://github.com/magcius/noclip.website).

---

MIT License

Copyright (c) 2018 Jasper St. Pierre

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## LibreQuake test map

`packages/worldview-editor/test/fixtures/librequake-b_batt0.map` is a normalized-LF copy of
LibreQuake's `lq1/maps/src/brushmodels/b_batt0.map`, pinned from commit
`e53f8313ab2c396dbc9ed911f5489629234b68e1`. The map credits Mr.M and Nolcoz in its
`worldspawn`. It is used only as source-format compatibility test data.

Copyright © 2019-2023 Contributors to the LibreQuake project. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted
provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice, this list of conditions
  and the following disclaimer.
- Redistributions in binary form must reproduce the above copyright notice, this list of
  conditions and the following disclaimer in the documentation and/or other materials provided
  with the distribution.
- Neither the name of the LibreQuake project nor the names of its contributors may be used to
  endorse or promote products derived from this software without specific prior written
  permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Hosted URL dependencies

The Worldview service uses the following MIT-licensed packages for compact random identifiers and
Unicode-aware decorative URL slugs. Their package distributions retain their license texts.

- [`nanoid`](https://github.com/ai/nanoid) 6.0.1, copyright Andrey Sitnik and contributors.
- [`@sindresorhus/slugify`](https://github.com/sindresorhus/slugify) 3.0.0, copyright Sindre Sorhus.
- [`@sindresorhus/transliterate`](https://github.com/sindresorhus/transliterate) 2.3.1,
  copyright Sindre Sorhus.
- [`escape-string-regexp`](https://github.com/sindresorhus/escape-string-regexp) 5.0.0,
  copyright Sindre Sorhus.

## Runtime schema validation

Worldview uses [`zod`](https://github.com/colinhacks/zod) 4.4.3 for declarative runtime schemas at
browser, persistence, package, and service trust boundaries. Zod is distributed under the MIT
License; its package distribution retains the license text. Copyright Colin McDonnell and
contributors.

## Editor interface dependencies

Worldview's editor uses the following MIT-licensed packages for its shared icon language and
virtualized material catalog. Their package distributions retain their license texts.

- [`@phosphor-icons/web`](https://github.com/phosphor-icons/web) 2.1.2, copyright Phosphor Icons.
- [`@tanstack/react-virtual`](https://github.com/TanStack/virtual) 3.14.10 and its
  `@tanstack/virtual-core` dependency, copyright Tanner Linsley and contributors.

## Browser persistence dependencies

Worldview's editor uses [`idb`](https://github.com/jakearchibald/idb) 8.0.3 for its typed IndexedDB
connection, transactions, and upgrades. `idb` is distributed under the ISC License. Persistence
tests use [`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB) 6.2.5, distributed under
the Apache License 2.0. Their package distributions retain their license texts.
