# Coverall

> Snail mail job applications for the internet-age, saving Canada Post one stamp at a time.

*Notice: this is a work in progress*

[![Build Status](https://travis-ci.org/Coaxial/coverall.svg?branch=master)](https://travis-ci.org/Coaxial/coverall) [![Coverage Status](https://coveralls.io/repos/Coaxial/coverall/badge.svg?branch=master&service=github)](https://coveralls.io/github/Coaxial/coverall?branch=master)

## What is Coverall?

Coverall is a NodeJS app for generating application packages to be sent to prospective employers via good old
fashioned snail mail.

Coverall takes a set of [LaTeX](https://en.wikipedia.org/wiki/LaTeX) documents, bundles them together and generates
PDF files to be printed and mailed. A hyperlink to a gzipped archive is inserted in the cover letter before it is
printed and the archive uploaded to the cloud (Amazon S3).

The gzipped archive contains PDF versions of the paper documents and is there for the recipient's convenience should they
wish to copy, forward and/or archive any of the documents received. It also contains the source code for Coverall, the
LaTeX code for the enclosed documents and a README.

I wrote Coverall because I thought it would be a fun opportunity to learn LaTeX, Gulp and apply for jobs. I'm
publishing it because it might be uselful to someone; if you do get a job from sending a coverall, you have to make my
day and let me know!

## How to use it

> You will need an [Amazon AWS account](https://aws.amazon.com/free/) to use their [Simple Storage Service
> (S3)](https://aws.amazon.com/s3/). Amazon offers a free 12 months trial if you have never used it before.

* Install NodeJS and npm:
You will need a functional node install. If you don't have one, [watch a
video](https://docs.npmjs.com/getting-started/installing-node), [download the installer](https://nodejs.org/en/) or
use [Homebrew](https://nodejs.org/en/). Note that you need Node 0.12, it won't work with 0.10 or Node 4 (yet).

* Clone the repo:

```bash
git clone https://github.com/Coaxial/coverall.git
```

* Coverall expects to find the following layout for your LaTeX documents, where `example` and `example2` are the
   companies' names to which the packages will be sent to:
```
coverall-documents/
├── coverletters
│   ├── README.md
│   ├── example
│   │   ├── contents.tex
│   │   ├── destaddress.tex
│   │   └── letter.tex
│   ├── example2
│   │   ├── contents.tex
│   │   ├── destaddress.tex
│   │   └── letter.tex
│   └── shared
│       ├── encl.tex
│       ├── ps.tex
│       └── senderaddress.tex
└── resume
    ├── README.md
    └── resume.tex
```

* Edit `config/config.json` to match your configuration:

> To see how to create S3 buckets and setup S3, check out [Amazon's
docs](http://docs.aws.amazon.com/AmazonS3/latest/gsg/GetStartedWithS3.html)

```json
{
    "latex_docs_path": "./coverall-documents",
    "s3_bucket": "your-coverall-bucket",
    "s3_region": "your-chosen-region-1"
}
```

* Use the example `config/secrets.json` and edit it with your configuration:

> To get your Bitly access token, visit [https://bitly.com/a/oauth_apps](https://bitly.com/a/oauth_apps) and click
"Generic Access Token".

```json
{
    "bitly_access_token": "<YOUR ACCESS TOKEN>"
}
```

* Install dependencies: 

```bash
npm install
```

* Run the app:

```bash
gulp go
```

* Open `./pdf-packages`, print the PDF documents contained inside. They are sorted by company name (example and
   example2 in this README). You can print them home if you are happy with your printer quality or you can drop them
   off to [Staples](http://www.staplescopyandprint.ca/) or your local friendly printing shop.

* Put the printouts in envelopes. The cover letters are formatted to fit in double windowed envelopes so you don't
   have to print the addresses again on the envelopes.

* Buy stamps, mail the envelopes and save Canada Post.

* Profit!

## coverall-documents directory structure

This is an example `coverall-documents` directory:

```
coverall-documents/
├── coverletters
│   ├── README.md
│   ├── example
│   │   ├── contents.tex
│   │   ├── destaddress.tex
│   │   └── letter.tex
│   ├── example2
│   │   ├── contents.tex
│   │   ├── destaddress.tex
│   │   └── letter.tex
│   └── shared
│       ├── encl.tex
│       ├── ps.tex
│       └── senderaddress.tex
└── resume
    ├── README.md
    └── resume.tex
```

`coverletters/example` and `coverletters/example2` are letters written for companies named "Example" and "Example
2". Companies names can't have any spaces. These names will be used to generate the archive's names. This example will
result in two packages and two archives, one for each company.

Your resume goes in the `resume` directory and will be included in every package.

The data in `coverletters/shared` will be included in every letter and includes boilerplate elements.

To apply to a new company, create a directory in `coverletters/` by the name of the new company. Copy over the three
`*.tex` files and replace the contents in `contents.tex` and `destaddress.tex` to suit your needs. 

## How does it work

Coverall generates two artifacts: a package and an archive.

### Package

A package is a single PDF document which is the result of compiling and merging the resume and the company's cover
letter. A SHA1 sum is generated from the contents of `resume.tex`, `contents.tex`, `destaddress.tex` and `letter.tex`
to generate a unique archive name which won't change unless the archive's key contents do.

Once the name has been generated, the S3 URL is derived from it. The S3 URL is then passed to Bitly to shorten the
link and make it easier to type from the letter. Short links are tagged with the company's name and a timestamp so
they are easier to keep track of.

Now that Coverall knows the short URL, it inserts it in a new file `url.tex` that is saved next to `letter.tex`. The
package is then created by compiling the `*.tex` documents to PDF and merging the resulting PDFs.

### Archive

After the package has been generated, the archive is filled. It has the following struture:

```
example_b45e2f.tar.gz/
├── code
│   ├── coverall
|   |   └── <the coverall repository>
|   └── coverall-documents
|       ├── coverletters
|       |   ├── example
|       │   |   ├── contents.tex
|       │   |   ├── destaddress.tex
|       │   |   └── letter.tex
|       |   └── shared
|       |       ├── encl.tex
|       |       ├── ps.tex
|       |       └── senderaddress.tex
|       └── resume
|           ├── contents.tex
|           ├── destaddress.tex
|           └── letter.tex
├── pdf
|   └── example.pdf
└── README.md
```

Each archive is uploaded to S3 once it is complete, ready to be downloaded by the coverletter's recipient.

### Design decisions

#### LaTeX

I used LaTeX for the text documents because it produces beautifully typeset text. It can be dry to work with and might
not be as flexible as I wish but these issues can be worked around by manipulating the tex source files as text with
other languages. It also makes it easier to keep my resume in version control.

#### NodeJS

Coverall started as a set of Gulp tasks because I thought it would make sense to manipulate files as Gulp advocates.
But it turned out to be an uphill battle because Gulp is better suited at parsing CSS, JS, HTML... Writing Coverall
using Gulp meant writing my own plugins every step of the way and it didn't make sense, so I switched to a more
vanilla NodeJS app, with Gulp as a development tool.

I picked NodeJS because of the event loop. There had to be several cover letters to be generated and I wanted it to
happen in parallel, which Node is pretty good at doing out of the box.

#### Amazon S3

Amazon S3 was the easiest and most ubiquitous object store to use, the API is exceptionally well documented and there
is an official and extensive Node module.

#### Bitly

Bitly is a well known link shortener and even though I had to make a pull request to implement the endpoints I needed
to tag links, it made sense to use this particular shortening service. Short links can be scary because it's hard to
know where they lead to, I figured that using a well known service would help mitigate the potential trust issue.

## Testing

Run the gulp task `gulp test` to run the test suite. To see test coverage and run the test suite: `gulp cov`.

Tests use [nock](github.com/pgte/nock) for mocking the Bitly and S3 APIs. There should be no need to update fixtures
as both Bitly's and S3's APIs are versioned.

## License

MIT

Copyright (c) 2015 Coaxial <py@poujade.org>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
