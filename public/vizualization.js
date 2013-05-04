/**
 * ===============
 * Network graph
 * ===============
 */
var networkWidth = 925,
    networkHeight = 230,
    networkViz,
    force,
    nodes = [],
    nodeIndexes = {};

function initNetwork() {

    networkViz = d3.select("#networkvis")
                   .append("svg")
                   .attr("width", networkWidth)
                   .attr("height", networkHeight);

    force = d3.layout.force()
              .gravity(.03)
              .charge(-225)
              .linkDistance(20)
              .linkStrength(0.1)
              .size([networkWidth, networkHeight]);

};

function updateNetwork(callback) {

    callback = callback || function() {};

    d3.json("/graph", function(err, results) {
        if (err) {
            alert("Error retrieving data.\n" + err);
            return false;
        }
        if (results.length < 1) {
            // Empty data set.
            return false;
        }

        var links = [];

        // Build nodes array
        for (var i = 0; i < results.users.length; i++) {
            if (!nodeIndexes.hasOwnProperty(results.users[i].user)) {
                nodes.push({
                    type: 'user',
                    name: results.users[i].user,
                    gravatar: results.users[i].gravatar
                });
                nodeIndexes[results.users[i].user] = nodes.length - 1;
            }
            if (!nodeIndexes.hasOwnProperty(results.users[i].project)) {
                nodes.push({
                    type: 'project',
                    name: results.users[i].project
                });
                nodeIndexes[results.users[i].project] = nodes.length - 1;
            }
        }
        // Build links array
        for (i = 0; i < results.users.length; i++) {
            links.push({
                source: nodeIndexes[results.users[i].user],
                target: nodeIndexes[results.users[i].project]
            });
        }

        force.nodes(nodes).links(links).start();

        var link = networkViz.selectAll(".link")
                             .data(links, function(d) { return "" + d.source.name + "-" + d.target.name; })
                             .enter()
                                .append("line")
                                .attr("id", function(d) { return "" + d.source.name + "-" + d.target.name; })
                                .attr("class", "link");

        var node = networkViz.selectAll(".node")
                             .data(nodes, function(d) { return d.name; })
                             .enter()
                                .append("g")
                                .attr("id", function(d) { return d.name + "-node"; })
                                .attr("class", function(d) { return "node " + d.type; })
                                .on("click", function(d) {
                                    if (d.type === "project") {
                                        var id = "#" + d.name.replace("/", "\\/");
                                        if ($(id).length === 0) {
                                            return;
                                        }
                                        // Show / hide project
                                        var g = d3.select(id);
                                        if (g.style("opacity") == 1) {
                                            // make mouseover pass through lines
                                            g.style("pointer-events", "none");

                                            // fade out project lines
                                            g.style("opacity", 1)
                                             .transition()
                                             .duration(400)
                                             .style("opacity", 0);

                                            // fade out project node
                                            d3.select(this).style("opacity", 1)
                                              .transition(400)
                                              .duration(400)
                                              .style("opacity", 0.4);
                                        }
                                        else {
                                            // make mouseover respond to lines
                                            g.style("pointer-events", "auto");

                                            // fade in project lines
                                            g.style("opacity", 0)
                                             .transition()
                                             .duration(400)
                                             .style("opacity", 1);

                                            // fade in project node
                                            d3.select(this).style("opacity", 0.4)
                                              .transition(400)
                                              .duration(400)
                                              .style("opacity", 1);
                                        }
                                    }
                                })
                                .call(force.drag);

        node.append("image")
            .attr("xlink:href", function(d) {
                if (d.gravatar) {
                    // User avatar
                    return "http://www.gravatar.com/avatar/" + d.gravatar + ".jpg?s=30&d=mm";
                }
                else {
                    // Generic project avatar
                    return "octocat.png";
                }
            })
            .attr("x", function(d) { return d.type === "user" ? -15 : -25; })
            .attr("y", function(d) { return d.type === "user" ? -15 : -25; })
            .attr("width", function(d) { return d.type === "user" ? 30 : 50; })
            .attr("height", function(d) { return d.type === "user" ? 30 : 50; });

        node.append("text")
            .attr("dx", function(d) { return (-2 * d.name.length) - 4; })
            .attr("dy", 30)
            .text(function(d) { return d.name; });

        force.on("tick", function() {

            link.attr("x1", function(d) { return d.source.x; })
                .attr("y1", function(d) { return d.source.y; })
                .attr("x2", function(d) { return d.target.x; })
                .attr("y2", function(d) { return d.target.y; });

            node.attr("transform", function(d) {
                d.x = Math.max(30, Math.min(networkWidth - 30, d.x));
                d.y = Math.max(30, Math.min(networkHeight - 30, d.y));
                return "translate(" + d.x + "," + d.y + ")";
            });

        });

        force.on("end", function() {
            callback();
        });
    });

};

/**
 * ===============
 * Line graph
 * ===============
 */

var linesWidth = 975,
    linesHeight = 350,
    linesMargin = 60,
    linesLock = {data:[]},
    linesX = d3.time.scale()
               .domain([new Date("2012-01-01"), d3.time.day.offset(new Date(), 1)])
               .rangeRound([linesMargin/4, linesWidth - linesMargin*2])
               .clamp(true),
    linesY = d3.scale.linear()
               .domain([0, 100])
               .rangeRound([linesHeight - linesMargin, linesMargin])
               .clamp(true),
    linesGradientStop = d3.time.scale()
                          .domain([new Date("2012-01-01"), d3.time.day.offset(new Date(), 1)])
                          .range([0, 1])
                          .clamp(true),
    linesColor = d3.scale.linear()
                   .domain([-5, 5]) // negative to positive sentiment
                   .range(["hsl(0,100%,50%)", "hsl(240,100%,50%)"]) // red to blue
                   .interpolate(d3.interpolateLab), // perceptually linear
    linesAxisX = d3.svg.axis()
                   .scale(linesX),
    linesAxisY = d3.svg.axis()
                   .scale(linesY)
                   .orient("left"),
    linesTitle = "Function Complexity",
    linesAxisXLabel = "Commit Date",
    linesAxisYLabel = "Cyclomatic Complexity",
    line = d3.svg.line()
             .x(function(d,i) { return linesX(new Date(d.t*1000)); })
             .y(function(d) { return linesY(d.c); })
             .interpolate("basis"),
    linesSvg,
    linesDefs,
    linesVis;

function initLines() {

    linesSvg = d3.select("#linesvis")
                 .append("svg:svg")
                 .attr("width", linesWidth)
                 .attr("height", linesHeight);

    linesDefs = linesSvg.append("svg:defs");

    linesSvg.append("text")
            .attr("class", "title")
            .attr("text-anchor", "middle")
            .attr("transform", "translate(" + (linesWidth/2 - linesTitle.length) + ",10)")
            .text(linesTitle);

    linesVis = linesSvg.append("svg:g")
                       .attr("transform", "translate("+linesMargin+",-"+ (linesMargin/2) + ")");

};

function updateLines(endpoint, clearChart) {
    d3.json(endpoint, function(err, results) {
        if (err) {
            alert("Error retrieving data.\n" + err);
            return false;
        }
        if (results.length < 1) {
            // Empty data set.
            return false;
        }

        if (clearChart) {
            linesVis.selectAll("g").remove();
            linesDefs.selectAll(".func-gradient").remove();
        }

        // Scale the Y axis to the new data
        var max = d3.max(results, function(project) {
            return d3.max(project.functions, function(func) {
                return d3.max(func.data, function(d) {
                    return d.c;
                });
            })
        });
        linesY.domain([0, max]);
        linesAxisY.scale(linesY);

        // Setup gradients for each line,
        // representing commit message sentiment.
        var i, gradient;
        for (i = 0; i < results.length; i++) {
            gradient = linesDefs.selectAll("linearGradient")
                                .data(results[i].functions, function(d) { return d.id; })
                                .enter()
                                    .append("svg:linearGradient")
                                    .attr("id", function(d) { return d.id + "-gradient"; })
                                    .attr("class", "func-gradient")
                                    .attr("gradientUnits", "userSpaceOnUse")
                                    .attr("x1", "0%")
                                    .attr("y1", "0%")
                                    .attr("x2", "100%")
                                    .attr("y2", "0%");

            gradient.selectAll("stop")
                    .data(function(d) { return d.data; }, function(d) { return d.t + ',' + d.s; })
                    .enter()
                        .append("svg:stop")
                        .attr("offset", function(d) { return linesGradientStop(new Date(d.t*1000)); })
                        .attr("style", function(d) { return "stop-color:" + linesColor(d.s) + ";"; });
        }

        // Group functions by project.
        var g = linesVis.selectAll("g.project")
                        .data(results, function(d) { return d.project })
                        .enter()
                            .append("svg:g")
                            .attr("id", function(d) { return d.project; })
                            .attr("class", "project");

        // Draw a line for each function.
        var path = g.selectAll("path")
                    .data(function(d) { return d.functions; }, function(d) { return d.id; })
                    .enter()
                        .append("svg:path")
                        .attr("id", function(d) { return d.id; })
                        .attr("file", function(d) { return d.file; })
                        .attr("name", function(d) { return d.name; })
                        .attr("stroke", function(d) { return "url(#" + d.id + "-gradient)"; })
                        .attr("d", function(d) { return line(d.data); })
                        .on("click", onclick)
                        .on("mouseover", onmouseover)
                        .on("mouseout", onmouseout);

        drawLinesAxis();

        // Create group for author circles
        linesVis.selectAll(".authors").remove();
        linesVis.append("svg:g")
                .attr("class", "authors");
    });
};

function drawLinesAxis() {
    // Delete any existing axis
    d3.selectAll(".axis").remove();

    // Draw x axis
    group = linesVis.append("svg:g")
                    .attr("class", "axis")
                    .attr("text-anchor", "middle")
                    .attr("transform", "translate(0," + (linesHeight-linesMargin) + ")")
                    .call(linesAxisX);

    // Draw x axis label
    group.append("text")
         .attr("class", "axis label")
         .attr("text-anchor", "middle")
         .attr("transform", "translate(" + ((linesWidth-linesMargin)/2 - linesMargin/2 - linesAxisXLabel.length) + "," + linesMargin + ")")
         .text(linesAxisXLabel);

    // Draw y axis
    group = linesVis.append("svg:g")
                    .attr("class", "axis")
                    .attr("text-anchor", "middle")
                    .attr("transform", "translate(" + ((linesMargin/4) - 10) + ",0)")
                    .call(linesAxisY);

    // Draw y axis label
    group.append("text")
         .attr("class", "axis label")
         .attr("text-anchor", "middle")
         .attr("transform", "translate(-" + (3*linesMargin/4) + "," + ((linesHeight-linesMargin)/2 + linesAxisYLabel.length) + ")rotate(-90)")
         .text(linesAxisYLabel);

    // Draw color legend
    var gradient = linesDefs.append("svg:linearGradient")
                            .attr("id", "legend-gradient")
                            .attr("gradientUnits", "objectBoundingBox")
                            .attr("x1", "0%")
                            .attr("y1", "0%")
                            .attr("x2", "100%")
                            .attr("y2", "0%");
    for (var i = 0; i < 11; i++) {
        gradient.append("svg:stop")
                .attr("offset", (i*10) + "%")
                .attr("style", "stop-color:" + linesColor(i-5) + ";");
    }
    group = linesVis.append("svg:g")
                    .attr("class", "axis")
                    .attr("text-anchor", "middle")
                    .attr("transform", "translate(" + (linesWidth - (linesMargin*2) - 150) + "," + (linesHeight - 20) + ")");
    group.append("rect")
         .attr("class", "axis")
         .attr("width", 150)
         .attr("height", 20)
         .attr("fill", "url(#legend-gradient)");
    group.append("text")
         .attr("text-anchor", "middle")
         .attr("transform", "translate(5,35)")
         .text("-5");
    group.append("text")
         .attr("class", "axis label")
         .attr("text-anchor", "middle")
         .attr("transform", "translate(75,35)")
         .text("Sentiment");
    group.append("text")
         .attr("text-anchor", "middle")
         .attr("transform", "translate(145,35)")
         .text("+5");

}

function onclick(d) {

    // Check if this line's project is hidden
    if ($(this).parent().css("opacity") != 1) {
        return;
    }

    if (d.data === linesLock.data) {
        linesLock = {data:[], obj:null};
    }
    else {
        var oldLock = linesLock;
        linesLock = {data:d.data, obj:this};
        if (oldLock.obj) {
            onmouseout.apply(oldLock.obj, [oldLock]);
        }
    }

};

function onmouseover(d) {

    // Check if this line's project is hidden
    if ($(this).parent().css("opacity") != 1) {
        return;
    }

    // Make the line stand out
    d3.select(this).classed("hover", true);

    // Show project, file, and function name below graph
    var project = $(this).parent().attr('id'),
        file = d3.select(this).attr('file'),
        name = d3.select(this).attr('name'),
        details = '<h3>' + project + '</h3><p>File: ' + file + '<br />Function: ' + name + '</p>';
    d3.select('#details').html(details);

    // Add commit author name and picture as points along the line.
    var g = linesVis.select("g.authors")
                .selectAll("g.author")
                .data(d.data, function(d) { return d.t + ',' + d.c; })
                .enter()
                    .append("g")
                    .attr("class", "author")
                    .attr("transform", function(d) { return "translate(" + linesX(new Date(d.t*1000)) + "," + linesY(d.c) + ")" })
                    .on("mouseover", function() { // Enlarge image and show name
                        var g = d3.select(this);
                        g.select("image")
                            .attr("x", -20)
                            .attr("y", -20)
                            .attr("width", 40)
                            .attr("height", 40);
                        g.select("rect")
                            .classed("hidden", false);
                        g.select("text")
                            .classed("hidden", false);
                    })
                    .on("mouseout", function() { // Shrink image and hide name
                        var g = d3.select(this);
                        g.select("image")
                            .attr("x", -6)
                            .attr("y", -6)
                            .attr("width", 12)
                            .attr("height", 12);
                        g.select("rect")
                            .classed("hidden", true);
                        g.select("text")
                            .classed("hidden", true);
                    });

    g.append("svg:image")
        .attr("xlink:href", function(d) { return "http://www.gravatar.com/avatar/" + d.g + ".jpg?s=40&d=mm"; })
        .attr("x", -6)
        .attr("y", -6)
        .attr("width", 12)
        .attr("height", 12);
    g.append("svg:rect")
        .attr("x", -20)
        .attr("y", 20)
        .attr("width", function(d) { return d.n.length * 7; })
        .attr("height", 15)
        .attr("rx", 5)
        .attr("ry", 5)
        .classed("hidden", true);
    g.append("svg:text")
        .text(function(d) { return d.n; })
        .attr("x", -20)
        .attr("y", 30)
        .attr("width", function(d) { return d.n.length * 7; })
        .attr("height", 15)
        .classed("hidden", true);

};

function onmouseout(d) {

    // Check if this line's project is hidden
    if ($(this).parent().css("opacity") != 1) {
        return;
    }

    if (d.data === linesLock.data) {
        // Keep focus on the line that was clicked
        return;
    }

    // Unfocus the line
    d3.select(this).classed("hover", false);

    // Clear the project, file, and function name,
    // except when a line is clicked.
    var details = '';
    if (linesLock.obj) {
        var project = $(linesLock.obj).parent().attr('id'),
            file = d3.select(linesLock.obj).attr('file'),
            name = d3.select(linesLock.obj).attr('name');

        details = '<h3>' + project + '</h3><p>File: ' + file + '<br />Function: ' + name + '</p>';
    }
    d3.select('#details').html(details);

    // Remove authors on the line being unfocused,
    // except when the line is clicked.
    linesVis.select("g.authors")
            .selectAll("g.author")
            .data(linesLock.data, function(d) { return d.t + ',' + d.c; })
            .exit().remove();

};

window.onload = function() {

    initNetwork();
    updateNetwork();
    initLines();
    drawLinesAxis();
    updateLines('all');

    $('#addform').submit(function(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        var addval = $('#addbox').val();

        if (!addval) {
            return;
        }

        $('.spinner').show();

        $.ajax({
            url: '/add/' + addval,
            timeout: 300000,
            success: function(data) {
                $('.spinner').hide();
                $('#addbox').val('');
                clearInterval(window.intervalId);
                setTimeout(function() {
                    updateNetwork();
                    updateLines('all', true);
                }, 1000);
            },
            error: function() {
                $('.spinner').hide();
                $('#addbox').val('');
                clearInterval(window.intervalId);
                setTimeout(function() {
                    updateNetwork();
                    updateLines('all', true);
                }, 1000);
            }
        });

        window.intervalId = setInterval(function() {
            updateNetwork();
            updateLines('all', true);
        }, 10000);
    });

};
