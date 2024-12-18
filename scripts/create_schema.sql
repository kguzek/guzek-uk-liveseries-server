CREATE DATABASE liveseries CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `liveseries`.`downloaded_episodes` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `show_id` INT NOT NULL,
  `show_name` VARCHAR(32) NOT NULL,
  `season` INT NOT NULL,
  `episode` INT NOT NULL
);