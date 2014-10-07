var cluster   = require('cluster');
var fs        = require('fs-extra');
var async     = require('async');
var extend    = require('./extend');
var aJSON     = require('./json');
var utils    = require('./utils');
var path      = __dirname.replace(/\/lib$/g, "/db/");


var dev = process.env.NODE_ENV && process.env.NODE_ENV == "dev";
var lib = {};

lib.load = function(object, name, callback){

	var label = "Euphoria: READ \"" + name + "\" OK! ";
	if(dev) console.log("Euphoria:", "TRY READ... \"" + name + "\"");
	if(dev) console.time(label);

	var tmp = path + "tmp~" + name + "_euphoria.db";
	var fln = path + name + "_euphoria.db";
	if (fs.existsSync(fln) || fs.existsSync(tmp) || !fs.existsSync(path + name)) {
		var tmp = {};
		lib.ld(object, name + "_euphoria", path, function(err) {
			if(dev) console.timeEnd(label);
			lib.pathSave(object, name, callback, true);
		});
	} else {
		lib.pathLoad(object, name, function(err) {
			if(dev) console.timeEnd(label);
			callback(err);
		});
	}
};

lib.save = function(object, name, callback){
	lib.sv(object, name + "_euphoria", path, callback);
};


lib.pathSave = function(object, name, callback, first){

	if(dev) console.log("Euphoria: TRY WRITE... \"" + name + "\"");
	var label = "Euphoria: WRITE \"" + name + "\" OK! ";
	if(dev) console.time(label);

	utils.getFields(object, name, function(err, data){
		async.eachSeries(data.toSave,
			function(el, callback) {
				lib.sv(object[el], el, path + (data.inArch.indexOf(el) == -1 ? "": "/archive") + name + "/" , callback);
			},
			function(err){
				if (err) {
					callback(err);
				} else {
					async.eachSeries(data.toDelete,
						function(el, callback) {
							fs.unlink(path + name + "/" + el + ".db", callback);
						},
						function(err){
							if (!err && first) {
								var tmp = path + "tmp~" + name + "_euphoria.db";
								var fln = path + name + "_euphoria.db";
								if (fs.existsSync(fln)) fs.unlinkSync(fln);
								if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
							}
							if(dev) console.timeEnd(label);
							callback(err);
						}
					);
				}
			}
		);

	});
};


lib.pathLoad = function(object, name, callback){
	utils.getFields(object, name, function(err, data){

		async.eachSeries(data.toLoad,
			function(el, callback) {
				if (typeof object[el] == 'undefined') object[el] = {};
				lib.ld(object[el], el, path + name + "/" , function(err, data) {
					if (!err && typeof data != 'object') {
						object[el] = data;
					}
					callback(err, data);
				});
			},
			function(err){
				callback(err);
			}
		);

	});
};


lib.sv = function(object, name, path, callback){

	var tmp = path + "tmp~" + name + ".db";
	var fln = path + name + ".db";

	try {

		var exists, exists_tmp, jsn;
		async.series([
			// fln exists?
			function(callback){
				fs.exists(fln, function (e) {
					exists = e;
					if (!e && dev) console.log("Euphoria: Мain db file not found");
					callback(null, exists);
				});
			},
			// tmp exists?
			function(callback){
				fs.exists(tmp, function (e) {
					exists_tmp = e;
					if (e && dev) console.log("Euphoria: Temporary db file found!");
					callback(null, exists_tmp);
				});
			},
			// deleting tmp
			function(callback){
				if (exists && exists_tmp){
					fs.unlink(tmp, function(err) {
						if (err) throw err;
						callback(null);
					});
				} else {
					callback(null);
				}
			},
			// copy old database to temporary file
			function(callback){
				if (exists){
					fs.copy(fln, tmp, function(err) {
						if (err) throw err;
						fs.chmod(tmp, "666", function() {
							callback(null);
						});
					});
				} else {
					callback(null);
				}
			},
			// JSON
			function(callback){
				setTimeout(function() {
					if (module.parent && typeof object == "object" && Object.keys(object).length < 20) {
						aJSON.stringify(object, function (err, jsonValue) {
						    if (err) throw err;
						    jsn = jsonValue;
						    setImmediate(function() {callback(null, jsn);});
						});
					} else {
						jsn = JSON.stringify(object);
						callback(null, jsn);
					}
				},0);
			},
			// write database
			function(callback){
				fs.outputFile(fln, jsn, {encoding: 'utf8'}, function(err) {
					if (err) throw err;
					fs.chmod(fln, "666", function() {
						callback(null);
					});
				});
			},
			// tmp exists?
			function(callback){
				fs.exists(tmp, function (e) {
					exists_tmp = e;
					callback(null, exists_tmp);
				});
			},
			// deleting tmp
			function(callback){
				if (exists_tmp){
					fs.unlink(tmp, function(err) {
						if (err) throw err;
						callback(null);
					});
				} else {
					callback(null);
				}
			}
		],
		function(err, results){
			// commit
			callback(null);
		});

	} catch (e) {
		console.warn("Euphoria:", e + ' in "lib.save()"');
		callback(e, false);
	}
};

lib.ld = function(object, name, path, callback){

	var tmp = path + "tmp~" + name + ".db";
	var fln = path + name + ".db";
	var data;

	try {

		var exists, exists_tmp;
		async.series([
			// fln exists?
			function(callback){
				fs.exists(fln, function (e) {
					exists = e;
					callback(null, exists);
				});
			},
			// tmp exists?
			function(callback){
				fs.exists(tmp, function (e) {
					exists_tmp = e;
					callback(null, exists_tmp);
				});
			},
			// load file
			function(callback){
				// save file if not exists
				if(!exists && !exists_tmp) {
					lib.save(object, name, function(err){
						if(!err) {
							callback(null);
						} else {
							callback(err);
						}
					});
				} else if (exists_tmp){
					fs.readFile(tmp, {encoding: 'utf8'}, function(err, d) {
						try {

							if (err) throw err;
							var p = JSON.parse(d);
							process.nextTick(function() {
								callback(null, p);
							});
						} catch (e) {
							if (dev) console.log("Euphoria: Error from loading temporary file (" + e + ")");
							if (exists){
								if (dev) console.log("Euphoria: Try load main file...");
								fs.readFile(fln, {encoding: 'utf8'}, function(err, d) {
									try {
										if (err) throw err;
										var p = JSON.parse(d);
										process.nextTick(function() {
											callback(null, p);
										});
									} catch (e) {
										console.warn("Euphoria: Error from loading main file (" + e + ")! We lost it =(");
										process.nextTick(function() {
											callback(e, false);
										});
										return;
									}
								});
							} else {
								console.warn("Euphoria: Main DB was not found! We lost it =(");
								process.nextTick(function() {
									callback(true, false);
								});
								return;
							}
						}
					});
				} else {
					fs.readFile(fln, {encoding: 'utf8'}, function(err, d) {
						try {
							if (err) throw err;
							var p = JSON.parse(d);
							process.nextTick(function() {
								callback(null, p);
							});
						} catch (e) {
							console.warn("Euphoria: Error from loading main file(" + e + ")! We lost it =(");
							process.nextTick(function() {
								callback(e, false);
							});
							return;
						}
					});
				}
			}

		],
		function(err, results){
			if (!err) {
				data = results[2];
				if (module.parent && typeof data == "object") extend(object, data);
				callback(null, (module.parent && typeof data == "object") ? object : data );
				delete data;
			} else {
				callback(err, false);
			}
		});

	} catch (e) {
		console.warn("Euphoria:", e + ' in "lib.load()"');
		callback(e, false);
	}
};


if (module.parent) {
	module.exports = lib;
} else {
	if (cluster.isWorker) {
		process.on('message', function(data) {
			data.args.push(function(err, result) {result = result||null; process.send( {'reqId': data.reqId, 'message': {'err': err, 'result': result}} );});
			lib[data.func].apply(this, data.args);
		});
		console.log("Euphoria: worker started in PID: " + process.pid);
		process.once('SIGINT', function() {}).once('SIGTERM', function() {});
	}
}



