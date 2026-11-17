CREATE TABLE "client_drive_folders" (
    "client_id" UUID PRIMARY KEY REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "folder_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resource_key" TEXT
);
