-- CreateTable
CREATE TABLE "downloaded_episodes" (
    "id" SERIAL NOT NULL,
    "show_id" INTEGER NOT NULL,
    "showName" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "episode" INTEGER NOT NULL,

    CONSTRAINT "downloaded_episodes_pkey" PRIMARY KEY ("id")
);
