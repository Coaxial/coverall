/*eslint-env mocha */
var expect = require('chai').expect;
var fs = require('fs');
var rewire = require('rewire');
var Package = rewire('../lib/package');
var async = require('async');
var path = require('path');
var nock = require('nock');

describe('Package', function() {
  var valid_config = {
    recipient: 'Test',
    files: {
      letter: 'test/fixtures/fileA.test',
      resume: 'test/fixtures/fileB.test'
    },
    config_files: {
      config: 'test/fixtures/config.json',
      secrets: 'test/fixtures/secrets.json'
    }
  };
  var revert = {};
  // Don't clutter the disk during tests
  var fsMock = {
    writeFile: function(file_name, contents, cb) {
      return cb(null);
    }
  };

  var SHORT_URL = 'http://bit.ly/1V5mTM2';
  var PACKAGE_NAME = 'test_0790feebb1'

  var bitly_host = 'https://api-ssl.bitly.com:443';
  var bitly_endpoints = {
    shorten: '/v3/shorten',
    link_edit: '/v3/user/link_edit'
  };
  var bitly_fixtures = {
    shorten: 'test/fixtures/bitly_com_shorten.json',
    link_edit: 'test/fixtures/bitly_com_link_edit.json'
  };

  nock(bitly_host)
    .persist()
    .get(bitly_endpoints.shorten)
    .query(true)
    .replyWithFile(200, bitly_fixtures.shorten)
    .get(bitly_endpoints.link_edit)
    .query(true)
    .replyWithFile(200, bitly_fixtures.link_edit)

  beforeEach(function() {
    revert.fswriteFile = Package.__set__('fs.writeFile', fsMock.writeFile);
  });

  afterEach(function(done) {
    // Reverts every mock so they don't have to be manually reverted every time
    async.forEachOf(revert, function(revert_mock, mock_name, next) {
      revert_mock();
      delete revert[mock_name];
      next();
    }, done);
  });

  describe('#init', function() {
    var test_package;
    var revert;
    var fixture = {
      config_file_path: valid_config.config_files.config
    };

    beforeEach(function(done) {
      // Prevent writing url.tex during tests to avoid cluttering
      var fsMock = {
        writeFile: function(file_name, contents, done) {
          return done(null);
        }
      };
      revert = Package.__set__('fs.writeFile', fsMock.writeFile);

      async.parallel({
        loadFixture: function(next) {
          fs.readFile(fixture.config_file_path, function(err, data) {
            if (err) return done(err);
            fixture.config_data = JSON.parse(data);
            next();
          });
        },
        instantiatePkg: function(next) {
          test_package = new Package(valid_config);
          next();
        },
        initPkg: function(next) {
          test_package.init(function(err) {
            if (err) return done(err);
            next();
          });
        }
      }, function(err) {
        if (err) return done(err);
        done();
      });
    });

    afterEach(function() {
      // Remove fs.writeFile mock
      revert();
    });

    it('handles being initialized more than once', function(done) {
      test_package.init(function(err, pkg) {
        if (err) return done(err);
        expect(pkg.config).to.deep.equal(fixture.config_data);
        done();
      });
    });

    it('populates self.config', function() {
      expect(test_package.config).to.deep.equal(fixture.config_data);
    });

    it('populates self.long_url', function() {
      var long_url = 'https://test-bucket.s3.amazonaws.com/' + PACKAGE_NAME + '.tar.gz';

      expect(test_package.long_url).to.eq(long_url);
    });

    it('populates self.name', function() {
      expect(test_package.name).to.eq(PACKAGE_NAME);
    });

    it('populates self.short_url', function() {
      expect(test_package.short_url).to.eq(SHORT_URL);
    });
    
    it('writes the short URL to a LaTeX file', function(done) {
      var fsMock = {
        writeFile: function(file_name, contents, done) {
          var latex_string = '\\url{' + SHORT_URL + '}';
          expect(contents).to.eq(latex_string);
          done(null);
        }
      };

      var revert = Package.__set__('fs.writeFile', fsMock.writeFile);
      test_package.init(function(err) {
        revert();
        if (err) return done(err);
        done(null);
      });
    });
  });

  describe('self.name', function() {
    var subject;

    beforeEach(function(done) {
      subject = new Package(valid_config);
      subject.init(done);
    });

    it('is a string', function() {
      expect(typeof(subject.name)).to.eq('string');
    });

    it("contains the recipient's lowercase name", function() {
      expect(subject.name).to.match(/test/);
    });

    it('contains a 6 chars hash', function() {
      var hash_regex = /[a-f0-9]{6}/;
      expect(subject.name).to.match(hash_regex);
    });
  });

  describe('#make', function() {

    context('with existing tex files', function() {
      var subject;

      beforeEach(function(done) {
        subject = new Package(valid_config);
        subject.init(done);
      });

      it('populates self.compiled_files', function(done) {
        var execMock = function(cmd, opt, cb) {
          // the options to exec are optional
          if (!cb) {
            cb = opt;
            opt = {};
          }
          return cb(null);
        };
        revert.exec = Package.__set__('exec', execMock);

        subject.make(function(err) {
          if (err) return done(err);
          expect(subject.compiled_files).to.deep.equal({
            letter: 'test/fixtures/fileA.pdf',
            resume: 'test/fixtures/fileB.pdf',
            package: 'test/fixtures/test.pdf'
          });
          done(null);
        });
      });

      context('when artifacts are newer', function() {
        var subject;

        beforeEach(function(done) {
          var a_while_ago = new Date(1986, 7, 25, 0, 30);
          var now = new Date(Date.now());
          fsMock.stat = function(file, cb) {
            // ensures that the artifact is always newer than the code
            if (file.match(/.*\.pdf/)) return cb(null, { mtime: now });
            return cb(null, { mtime: a_while_ago });
          };
          revert.fsWriteFile = Package.__set__('fs.writeFile', fsMock.writeFile);
          revert.fsStat = Package.__set__('fs.stat', fsMock.stat);
          subject = new Package(valid_config);
          subject.init(done);
        });

        it('does not re-generate them', function(done) {
          var exec_not_called = true; // will fail test if the mock isn't run
          var execMock = function(cmd, opt, cb) {
            // the options to exec are optional
            if (!cb) {
              cb = opt;
              opt = {};
            }
            if (cmd.match(/^pdflatex/)) exec_not_called = false;
            return cb(null);
          };
          revert.exec = Package.__set__('exec', execMock);

          subject.make(function(err) {
            if (err) return done(err);
            expect(exec_not_called).to.eq(true);
            done();
          });
        });
      });

      context('when artifacts are older', function() {
        beforeEach(function(done) {
          var a_while_ago = new Date(1986, 7, 25, 0, 30);
          var now = new Date(Date.now());
          fsMock.stat = function(file, cb) {
            // ensures the code is always newer than the artifacact
            if (file.match(/.*\.pdf/)) return cb(null, { mtime: a_while_ago });
            return cb(null, { mtime: now });
          };
          revert.fsStat = Package.__set__('fs.stat', fsMock.stat);
          subject = new Package(valid_config);
          subject.init(done);
        });

        it('regenerates them', function(done) {
          var exec_called = false;
          var execMock = function(cmd, opt, cb) {
            // the options to exec are optional
            if (!cb) {
              cb = opt;
              opt = {};
            }
            if (cmd.match(/^pdflatex/)) exec_called = true;
            return cb(null);
          };
          revert.exec = Package.__set__('exec', execMock);

          subject.make(function(err) {
            if (err) return done(err);
            expect(exec_called).to.eq(true);
            done();
          });
        });
      });

      it('merges the letter and resume into one file', function(done) {
        var gs_cmd_string;
        var execMock = function(cmd, opt, cb) {
          if (!cb) {
            cb = opt;
            opt = {};
          }
          // ignore when exec runs for pdflatex
          if (cmd.match(/^gs/)) {
            gs_cmd_string = cmd;
          }
          return cb(null);
        };

        revert.execMock = Package.__set__('exec', execMock);
        var output_file_path = path.resolve('test/fixtures/test.pdf');
        var letter_file_path = path.resolve('test/fixtures/fileA.pdf');
        var resume_file_path = path.resolve('test/fixtures/fileB.pdf');
        var expected_gs_cmd_string = 'gs -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -sOutputFile=' + output_file_path + ' ' + letter_file_path + ' ' + resume_file_path;

        subject.make(function(err) {
          if (err) return done(err);
          expect(gs_cmd_string).to.eq(expected_gs_cmd_string);
          done();
        });
      });
    });
  });
});
