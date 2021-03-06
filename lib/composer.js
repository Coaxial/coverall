'use strict';

var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs-extra'));
var changeCase = require('change-case');
var crypto = require('crypto');
var child_process = require('child_process');
var path = require('path');

var composer = function() {
  // Private functions
  var generateHash = function generateHash(files) {
    var shasum = crypto.createHash('sha1');
    var ordered_files = files.sort();
    return Promise.all(
        ordered_files.map(function(file) {
          return new Promise(function(resolve, reject) {
            var stream = fs.createReadStream(file);
            stream.on('data', function(data) {
              shasum.update(data);
            });
            stream.on('end', function() {
              return resolve();
            });
            stream.on('error', function(e) {
              return reject(e);
            });
          });
        }))
      .then(function() {
        return shasum.digest('hex');
      });
  };

  // Public methods
  return {
    /**
     * Returns the package's name.
     * @param {Object} options
     * @param {Array} options.files - Paths to the files on which to base the hash calculation
     * @param {string} options.recipient_name - The package recipient's name. Comverted to param-case and used to
     * compose the first part of the name
     * @returns {Function} Promise - Fulfilled with the package's name as a string or rejected with an Error
     */
    getName: function getName(options) {
      var files = options.files;
      var prefix = changeCase.paramCase(options.recipient_name);
      return generateHash(files)
        .then(function(hash) {
          return prefix + '_' + hash.substr(0, 10);
        });
    },

    /**
     * @param {Object} options
     * @param {string} options.coverletter - Path to the directory containing the coverletter's tex file
     * @param {string} options.resume - Path to the directory containing the resume's tex file
     * where option.coverletter is located.
     * @param {Function} [options.texCompiler] - A function that takes the path to a TeX file as a string for input and
     * returns an array of resulting PDF files.
     * @param {Function} [options.pdfMerger] - A function that takes an array of PDF files as input and returns the path to
     * the file it merged the inputs into as a string.
     * @returns {Function} Promise - A promise resolved with the resulting pdf document's path as a string or rejected
     * with an Error
     */
    compile: function compile(options) {
      var coverletter = options.coverletter;
      var resume = options.resume;
      var recipient_name = path.basename(path.resolve(coverletter, '..'));
      var defaults = {
        texCompiler: function texCompiler(tex_doc) {
          // this function checks if there is already a PDF version for the tex document.
          // If there is, it checks whether the tex file has changed since the PDF was generated.
          // If the code has changed, it regenerates the PDF file. If not, it re-uses the existing file.
          var isPdfFresh = function isPdfFresh(tex_doc) {
            return new Promise(function(resolve) {
              var compiled_doc = path.resolve(path.dirname(tex_doc), path.basename(tex_doc, path.extname(tex_doc)) + '.pdf');
              return fs.statAsync(compiled_doc)
                .then(function(compiled_doc_stats) {
                  return fs.statAsync(tex_doc)
                    .then(function(tex_doc_stats) {
                      // we compare the age in number of ms since the epoch so the lower number represents the further
                      // moment in time.
                      if (tex_doc_stats.mtime < compiled_doc_stats.mtime) {
                        // The compiled doc is more recent than the tex doc
                        return resolve(true);
                      }
                      // the compiled doc is older than the tex doc
                      return resolve(false);
                    });
                })
              .catch(function() {
                // the compiled file doesn't exist
                return resolve(false);
              });
            });
          };
          var makePdf = function makePdf(tex_doc, skip) {
            // this function compiles TeX files to PDF if skip === false
            return new Promise(function(resolve, reject) {
              var latex_command = 'pdflatex';
              var pdf_output_filename = path.parse(tex_doc).name + '.pdf';
              var fulfilled_value = path.resolve(tex_doc, '..', pdf_output_filename);
              var cmd = latex_command + ' ' + tex_doc;
              var options = {
                cwd: path.resolve(tex_doc, '..') // pdflatex will only look for custom
                  // cls files in the cwd and includes relative to the cwd
              };

              if (skip) {
                return resolve(fulfilled_value);
              }

              child_process.spawn(cmd, options)
                .on('finish', function() {
                  resolve(fulfilled_value);
                })
                .on('error', function(e) {
                  reject(e);
                });
            });
          };

          return isPdfFresh(tex_doc)
            .then(function(isFresh) {
              return makePdf(tex_doc, isFresh);
            });
        },
        pdfMerger: function pdfMerger(pdf_files) {
          // this function merges a resume and a coverletter together into a single PDF
          var coverletter_pdf = pdf_files[0];
          var resume_pdf = pdf_files[1];
          var output_file = path.resolve(coverletter, '..', recipient_name) + '.pdf';
          var cmd = 'gs -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -sOutputFile=' + output_file + ' ' + coverletter_pdf + ' ' + resume_pdf;

          return new Promise(function(resolve, reject) {
            child_process.spawn(cmd)
              .on('finish', function() {
                resolve(output_file);
              })
              .on('error', function(e) {
                reject(e);
              });
          });
        }
      };
      var texCompiler = options.texCompiler || defaults.texCompiler;
      var pdfMerger = options.pdfMerger || defaults.pdfMerger;

      return Promise.all([coverletter, resume].map(texCompiler))
          .then(pdfMerger);
    }
  };
};

module.exports = {
  create: composer
};
