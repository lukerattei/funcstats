var express = require('express'),
    app = express(),
    funcstats = require('./lib/funcstats');

app.use(express.compress());
app.use(express.static(__dirname + '/public'));

app.get('/add/:user', function(req, res) {
    funcstats.addUserRepos(req.params.user, function(err, data) {
        if (err) throw err;

        res.send(data);
    });
});

app.get('/add/:user/:repo', function(req, res) {
    funcstats.addProject(req.params.user + "/" + req.params.repo, function(err, data) {
        if (err) throw err;

        res.send(data);
    });
});

app.get('/all', function(req, res) {
    funcstats.getCommitData(function(err, result) {
        if (err) throw err;

        res.setHeader('application/json');
        res.send(result);
    });
});

app.get('/graph', function(req, res) {
    funcstats.getGraphData(function(err, result) {
        if (err) throw err;

        res.send(result);
    });
});

app.listen(42513);
console.log('Listening on port 42513');
