-- Feel free to change the username as well as the password given to it
CREATE USER 'liveseries_api' @'localhost' IDENTIFIED BY 'CHANGE_THIS_PASSWORD';
-- In an ideal world, we should strictly provide the grants the API has access
-- to a specific table rather than all the privileges.
GRANT ALL PRIVILEGES ON `liveseries`.* TO 'liveseries_api' @'localhost';
FLUSH PRIVILEGES;