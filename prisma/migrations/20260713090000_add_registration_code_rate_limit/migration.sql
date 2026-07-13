CREATE TABLE "RegistrationCodeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "RegistrationCodeRequest_email_createdAt_idx"
ON "RegistrationCodeRequest"("email", "createdAt");
