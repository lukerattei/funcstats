CREATE TABLE `commits` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `project` varchar(255) NOT NULL DEFAULT '',
  `sha` char(40) NOT NULL DEFAULT '',
  `date` date NOT NULL,
  `datetime` datetime NOT NULL,
  `timestamp` int(11) NOT NULL,
  `user_name` varchar(255) NOT NULL DEFAULT '',
  `user_email` varchar(255) NOT NULL DEFAULT '',
  `user_gravatar` char(32) NOT NULL DEFAULT '',
  `commit_message` text NOT NULL,
  `sentiment` int(11) NOT NULL,
  `file` varchar(255) NOT NULL DEFAULT '',
  `language` varchar(255) NOT NULL DEFAULT '',
  `func` varchar(255) NOT NULL DEFAULT '',
  `complexity` int(11) NOT NULL,
  `lines` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `project_func` (`project`,`func`),
  KEY `gravatar` (`user_gravatar`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `user_projects` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `user` varchar(255) NOT NULL DEFAULT '',
  `project` varchar(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_project` (`user`,`project`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `users` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `login` varchar(255) NOT NULL DEFAULT '',
  `gravatar_id` char(32) NOT NULL,
  `avatar_url` varchar(255) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `gravatar` (`gravatar_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
