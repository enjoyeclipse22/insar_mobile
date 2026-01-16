CREATE TABLE `insar_projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`location` varchar(255),
	`status` enum('created','processing','completed','failed') NOT NULL DEFAULT 'created',
	`progress` int NOT NULL DEFAULT 0,
	`startDate` varchar(10),
	`endDate` varchar(10),
	`satellite` varchar(50),
	`orbitDirection` enum('ascending','descending'),
	`polarization` varchar(10),
	`coherenceThreshold` varchar(10) DEFAULT '0.4',
	`outputResolution` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `insar_projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processing_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stepId` int,
	`logLevel` enum('debug','info','warning','error') NOT NULL DEFAULT 'info',
	`message` text NOT NULL,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processing_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processing_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`resultType` enum('interferogram','coherence','deformation','dem','unwrapped_phase','los_displacement') NOT NULL,
	`fileUrl` varchar(512) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileSize` int,
	`format` varchar(50),
	`minValue` varchar(50),
	`maxValue` varchar(50),
	`meanValue` varchar(50),
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `processing_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `processing_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`stepName` varchar(100) NOT NULL,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`progress` int NOT NULL DEFAULT 0,
	`startTime` timestamp,
	`endTime` timestamp,
	`duration` int,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `processing_steps_id` PRIMARY KEY(`id`)
);
