var request = require('request');
var targz = require('tar.gz');
var rimraf = require('rimraf');
var fs = require('fs');
var log = require('npmlog');
var path = require('path');
var spawn = require('child_process').spawn;
var program = require('commander');

log.heading = 'xmin-installer';
var pkg, cwd, tarball, extract;

function onExtracted (err) {
  if (err) onError(err);
  if (!fs.existsSync(path.resolve(extract, 'setup.sh'))) {
    log.error(pkg.name, 'Extraction failed. setup.sh does not exist');
    process.exit(1);
  }
  log.info(pkg.name, 'Installing...');
  var setup = spawn(path.resolve(extract, 'setup.sh'), [ path.resolve('/usr/share', pkg.name) ], {
    env: {
      config_dir: path.resolve('/etc/', pkg.name),
      var_dir: path.resolve('/var/log/', pkg.name),
      perl: '/usr/bin/perl',
      port: this.port || 10000,
      login: this.username,
      password: this.password,
      password2: this.password,
      ssl: 0,
      atboot: 1
    }
  });
  setup.stdout.on('data', function (data) {
    log.verbose('setup.sh', ('' + data).trim());
  });
  setup.on('error', onError);
  setup.on('exit',  function () {
    if (fs.existsSync(tarball)) fs.unlinkSync(tarball);
    if (fs.existsSync(extract)) rimraf.sync(extract);

    log.info(pkg.name, 'Done');
    process.exit(0);
  });
}

function onDownloaded () {
  log.info(pkg.name, 'Extracting...');
  new targz().extract(tarball, path.resolve(extract, '..'), onExtracted.bind(this));
}

function onError (err) {
  throw err;
}

/**
 * Generate an xmin CLI
 */
exports.create = function (_cwd, _pkg) {
  pkg = _pkg;
  cwd = _cwd;
  tarball = path.resolve(cwd, pkg.name + '-' + pkg.slug.tag + '.tar.gz');
  extract = path.resolve(cwd, pkg.name +'-'+ pkg.slug.tag);

  if (fs.existsSync(tarball)) fs.unlinkSync(tarball);
  if (fs.existsSync(extract)) rimraf.sync(extract);

  program._name = pkg.name;
  program.version(pkg.version);

  this.install = program
    .command('install')
    .option('--username [username]', 'Default '+ pkg.name +' user [admin]')
    .option('--password [password]', 'Password for default '+ pkg.name +' user [admin]')
    .option('--port [port]', 'Specify '+ pkg.name +' server port')
    .action(function (cmd) {
      log.info('xmin', pkg.name, 'scheduled for install');
      log.http(pkg.name, 'Downloading...');
      request(pkg.slug.url).pipe(
        fs.createWriteStream(tarball)
          .on('finish', onDownloaded.bind(cmd))
          .on('error', onError)
        );
    });

  this.uninstall = program
    .command('uninstall')
    .action(function () {
      if (!fs.existsSync(path.resolve('/etc', pkg.name, 'uninstall.sh'))) {
        log.warn(pkg.name, 'Not installed.');
        process.exit(0);
      }
      log.info(pkg.name, 'Uninstalling...');
      var uninstall = spawn(path.resolve('/etc', pkg.name, 'uninstall.sh'));
      uninstall.stdout.on('data', function (data) {
        log.verbose('uninstall.sh', ('' + data).trim());
      });
      uninstall.on('error', onError);
      uninstall.on('exit', process.exit);
      uninstall.stdin.write('y\n');
    });

  this.help = program
    .command('help <command>')
    .action(function (command) {
      this[command].help();
    }.bind(this));

  program.parse(process.argv);

  if (!program.args.length) program.help();
};
