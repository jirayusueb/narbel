CREATE TABLE "processed_event" (
	"consumer" text,
	"event_id" uuid,
	"handled_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "processed_event_pkey" PRIMARY KEY("consumer","event_id")
);
