var async = require('async'),
    mysql = require('mysql'),
    GitHubApi = require('github'),
    exec = require('child_process').exec,
    spawn = require('child_process').spawn,
    fs = require('fs'),
    md5 = require('MD5'),
    strftime = require('strftime'),
    sentiment = require('sentiment'),
    config = require('./config'),
    concurrency = 7; // Turn this down if you run out of open file descriptors

var funcstats = (function() {

    function funcstats() {
        this.dbpool = mysql.createPool({
            host: config.mysql.host,
            user: config.mysql.user,
            password: config.mysql.password,
            database: config.mysql.database,
            connectionLimit: 140
        });

        this.github = new GitHubApi({
            version: "3.0.0",
            timeout: 5000
        });
        this.github.authenticate({
            type: "oauth",
            token: config.github.token
        })
    };

    funcstats.prototype.getCommitData = function(callback) {
        this.dbpool.getConnection(function(err, connection) {
            // Try to avoid truncated JSON data from GROUP_CONCAT() in later query.
            connection.query('SET @@group_concat_max_len = @@max_allowed_packet', function(err, result1) {
                if (err) {
                    connection.end();
                    return callback(err);
                }

                // Partly form JSON data in MySQL for performance
                var q = 'SELECT `project`, `file`, `func`, MD5(CONCAT(`project`,`file`,`func`)) AS `id`, CONCAT(\'[\',GROUP_CONCAT(CONCAT(\'{"t":\',`timestamp`,\',"c":\',`complexity`,\',"s":"\',`sentiment`,\'","l":\',`lines`,\',"n":"\',REPLACE(user_name,\'"\',\'\\\\"\'),\'","g":"\',`user_gravatar`,\'"}\') ORDER BY `timestamp`),\']\') AS `data` FROM `commits` GROUP BY `project`, `func` ORDER BY `project`';
                connection.query(q, function(err, result2) {
                    if (err) {
                        connection.end();
                        return callback(err);
                    }

                    var json = '[', func = '', project = '';

                    for (var i = 0; i < result2.length; i++) {
                        var testjson = result2[i].data;
                        try {
                            JSON.parse(testjson);
                        }
                        catch (e) {
                            console.log("Skipping truncated JSON for func " + result2[i].func + ": " + result2[i].data);
                            continue;
                        }
                        func = '{"id":"' + result2[i].id + '","file":"' + result2[i].file + '","name":"' + result2[i].func + '","data":' + result2[i].data + '}';

                        if (project !== result2[i].project) {
                            if (i !== 0) {
                                json += ']},';
                            }
                            json += '{"project":"' + result2[i].project + '","functions":[' + func;
                        }
                        else {
                            json += ',' + func;
                        }

                        if (i === result2.length-1) {
                            json += ']}';
                        }

                        project = result2[i].project;
                    }

                    json += ']';

                    connection.end();
                    callback(null, json);
                });
            });
        });
    };

    funcstats.prototype.getGraphData = function(callback) {
        var nodes = {};
        async.parallel([
            function(asyncCallback) {
                this.dbpool.getConnection(function(err, connection) {
                    var q = 'SELECT `project`, AVG(`complexity`) AS `avg_complexity`, AVG(`sentiment`) AS `avg_sentiment` FROM `commits` GROUP BY `project`';
                    connection.query(q, function(err, result) {
                        if (err) {
                            connection.end();
                            return asyncCallback(err);
                        }

                        nodes.projects = result;

                        connection.end();
                        asyncCallback();
                    });
                });
            }.bind(this),
            function(asyncCallback) {
                this.dbpool.getConnection(function(err, connection) {
                    var q = 'SELECT `login` AS `user`, `gravatar_id` AS `gravatar`, `project` AS `project` FROM `user_projects` JOIN `users` ON `users`.`login` = `user_projects`.`user`';
                    connection.query(q, function(err, result) {
                        if (err) {
                            connection.end();
                            return asyncCallback(err);
                        }

                        nodes.users = result;

                        connection.end();
                        asyncCallback();
                    });
                });
            }.bind(this)
        ], function(err) {
            if (err) return callback(err);

            callback(null, nodes);
        });
    };

    funcstats.prototype.addUserRepos = function(user, callback) {
        var repos = [];

        var processResults = function(err, res) {
            if (err) return callback(err);

            res.forEach(function(repo) {
                repos.push(repo.full_name);
            }.bind(this));
            if (this.github.hasNextPage(res)) {
                this.github.getNextPage(res, processResults);
            }
            else {
                async.forEach(repos, function(repo, asyncCallback) {
                    this.addProject(repo, asyncCallback);
                }.bind(this), function(err) {
                    if (err) return callback(err);

                    return callback(null, {done:true});
                });
            }
        }.bind(this);
        // Get repos that the user contributed to.
        this.github.repos.getFromUser({
            user: user,
            sort: 'updated',
            per_page: 100
        }, processResults);
    };

    funcstats.prototype.addProject = function(project, callback) {
        this.addProjectCollaborators(project, function(err) {});

        var processProject = function(err) {
            if (err) return callback(null, {done:1});

            this.getCommits(project, function(err, commits) {
                console.log(project + ": retrieved " + commits.length + " commits.");
                var commitCounter = 0;
                async.forEachLimit(commits, concurrency, function(commit, commitsCallback) {
                    ++commitCounter;
                    console.log(project + ": processing commit " + commitCounter);
                    async.forEachLimit(commit.blobs, concurrency, function(blob, blobsCallback) {
                        this.getComplexity(project, blob.file, blob.sha, function(functions) {
                            async.forEachLimit(functions, concurrency, function(func, functionsCallback) {
                                this.dbpool.getConnection(function(err, connection) {
                                    var gravatar = md5(commit.email.trim().toLowerCase());
                                    var data = {
                                        project: project,
                                        sha: commit.sha,
                                        date: strftime('%F', commit.date),
                                        datetime: strftime('%F %T', commit.date),
                                        timestamp: commit.date.getTime()/1000,
                                        user_name: commit.name,
                                        user_email: commit.email,
                                        user_gravatar: gravatar,
                                        commit_message: commit.message,
                                        sentiment: commit.sentiment,
                                        file: blob.file,
                                        language: func.language,
                                        func: func.name,
                                        complexity: func.complexity,
                                        lines: func.lines
                                    };
                                    connection.query("INSERT INTO `commits` SET ?", data, function(err, result) {
                                        connection.end();
                                        return functionsCallback(err);
                                    });
                                });
                            }.bind(this), function(err) {
                                return blobsCallback(err);
                            });
                        }.bind(this));
                    }.bind(this), function(err) {
                        return commitsCallback(err);
                    });
                }.bind(this), function(err) {
                    if (err) return callback(err);

                    return callback(null, {done:1});
                });
            }.bind(this));
        }.bind(this);

        this.dbpool.getConnection(function(err, connection) {
            var q = 'SELECT `project` FROM `commits` WHERE `project` = ? GROUP BY `project`';
            connection.query(q, [project], function(err, result) {
                if (err) {
                    connection.end();
                    return callback(err);
                }

                connection.end();

                if (result.length === 0) {
                    // Only download and process if the
                    // project has not been processed yet.
                    this.downloadProject(project, processProject);
                }
                else {
                    callback(null, {done:1});
                }
            }.bind(this));
        }.bind(this));
    };

    funcstats.prototype.addProjectCollaborators = function(project, callback) {
        var processResults = function(err, res) {
            if (err) return callback(err);

            res.forEach(function(collaborator) {
                this.dbpool.getConnection(function(err, connection) {
                    connection.query("INSERT IGNORE INTO `users` SET ?", {
                        id: collaborator.id,
                        login: collaborator.login,
                        gravatar_id: collaborator.gravatar_id,
                        avatar_url: collaborator.avatar_url
                    }, function(err, result) {
                        if (err) return callback(err);

                        connection.end();
                    });
                });
                this.dbpool.getConnection(function(err, connection) {
                    connection.query("INSERT IGNORE INTO `user_projects` SET ?", {
                        user: collaborator.login,
                        project: project
                    }, function(err, result) {
                        if (err) return callback(err);

                        connection.end();
                    });
                });
            }.bind(this));
            if (this.github.hasNextPage(res)) {
                this.github.getNextPage(res, processResults);
            }
        }.bind(this);

        var projectParts = project.split("/");

        this.github.repos.getCollaborators({
            user: projectParts[0],
            repo: projectParts[1],
            per_page: 100
        }, processResults);

    };

    funcstats.prototype.downloadProject = function(project, callback) {
        var cloneFunc = function() {
            console.log(project + ': downloading');
            var url = "git://github.com/" + project + ".git";
            var dir = "repos/" + project;
            try {
                exec("git clone " + url + " " + dir, callback);
            }
            catch (e) {
                // Already cloned project then
                callback(e);
            }
        };

        var projectParts = project.split("/");
        fs.mkdir("repos/" + projectParts[0], function(err) {
            // Ignore error, since the directory could already exist.

            cloneFunc();
        });
    };

    funcstats.prototype.getCommits = function(project, callback) {
        var dateLimit = config.git.date_limit ? (' --since=' + config.git.date_limit) : '',
            args = ['-c', 'git rev-list HEAD --reverse' + dateLimit + ' | git diff-tree -r --root --pretty="===================================================================================================%n%H%n%at%n%an%n%ae%n---------------------------------------------------------------------------------------------------%n%B%n---------------------------------------------------------------------------------------------------" --stdin'],
            git = spawn('sh', args, {cwd: 'repos/' + project}),
            commits = [], buffer = "";

        var flushBuffer = function() {
            var segments, subsegments, commit,
                commitBodies = buffer.split("===================================================================================================");

            if (commitBodies.length === 0) {
                return;
            }

            for (var i = 0; i < commitBodies.length; i++) {
                segments = commitBodies[i].trim().split("---------------------------------------------------------------------------------------------------");
                if (segments.length < 3) {
                    continue;
                }

                subsegments = segments[0].trim().split("\n");
                if (subsegments.length < 4) {
                    continue;
                }

                commit = {
                    sha: subsegments[0],
                    date: new Date(subsegments[1]*1000),
                    name: subsegments[2],
                    email: subsegments[3],
                    message: segments[1].trim(),
                    blobs: []
                };

                subsegments = segments[2].trim().split("\n");
                var line, blob;
                for (var j = 0; j < subsegments.length; j++) {
                    line = subsegments[j].split(/[ \t]+/);
                    if (line.length !== 6) {
                        continue;
                    }

                    blob = {
                        file: line[5],
                        sha: line[3]
                    };

                    if (blob.sha !== "0000000000000000000000000000000000000000") {
                        commit.blobs.push(blob);
                    }
                }

                commits.push(commit);
            }
        }

        git.stdout.on('data', function(data) {
            buffer = buffer + data;
        });

        git.stderr.on('data', function(data) {
            console.log(''+data);
        });

        git.on('close', function(code) {
            flushBuffer();

            // Add sentiment rating to commit messages
            async.forEach(commits, function(commit, next) {
                sentiment(commit.message, function(err, result) {
                    if (err) return next(err);

                    commit.sentiment = result.score;
                    next(null);
                });
            }, function(err) {
                if (err) return callback(err);

                if (!commits[commits.length-1]) {
                    return callback(null, commits);
                }

                exec('find * -type f', {cwd: 'repos/' + project}, function(err, stdout, stderr) {
                    if (err) return callback(null, commits);

                    var files = stdout.split("\n"),
                        finalBlobs = [];

                    for (var i = 0; i < files.length; i++) {
                        finalBlobs.push({
                            file: files[i],
                            sha: null
                        })
                    }

                    commits[commits.length-1].blobs = finalBlobs;

                    return callback(null, commits);
                });
            });
        });
    };

    funcstats.prototype.getComplexity = function(project, filename, blob, callback) {
        var functions = [], funcnames = [];

        if (filename.search(/\.rb$/) !== -1) {
            // Parse ruby file
            fs.realpath('vendor/saikuro/bin/saikuro', function(err, saikuroPath) {
                var cmd;
                if (blob) {
                    cmd = 'git cat-file -p ' + blob + ' | ' + saikuroPath;
                }
                else {
                    cmd = saikuroPath + ' < ' + filename;
                }
                var parser = spawn('sh', ['-c', cmd], {cwd: 'repos/' + project});

                var buffer = "";

                var flushBuffer = function() {
                    try {
                        var funcs = JSON.parse(buffer);
                        funcs.forEach(function(func) {
                            func.language = 'ruby';
                            if (func.name && func.complexity) {
                                if (funcnames.indexOf(func.name) === -1) {
                                    // Function is unique in this file.
                                    functions.push(func);
                                }
                                else {
                                    // Handle multiple declarations of a function
                                    // by summing their complexity and lines
                                    for (var j = 0; j < functions.length; j++) {
                                        if (functions[j].name === func.name) {
                                            funcitons[j].complexity += func.complexity;
                                            functions[j].lines += func.lines;
                                        }
                                    }
                                }
                                funcnames.push(func.name);
                            }
                        });
                    }
                    catch (e) {}
                };

                parser.stdout.on('data', function(data) {
                    buffer = buffer + data;
                });

                parser.stderr.on('data', function(data) {
                    console.log(''+data);
                });

                parser.on('close', function(code) {
                    flushBuffer();

                    callback(functions);
                });
            });
        }
        else {
            // Cannot parse file to measure complexity.
            callback(functions);
        }
    }

    return new funcstats();

})();

module.exports = funcstats;