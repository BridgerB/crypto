// db/drop-all.js
import { exec } from "child_process";
import { promisify } from "util";
import { db } from "./index.js";
import { sql } from "drizzle-orm";

const execAsync = promisify(exec);

async function dropAllTables() {
  try {
    console.log(
      "Dropping all tables, constraints, and data from the database...",
    );

    // Execute a raw SQL query to drop all tables and constraints
    // First, disable any foreign key checks to avoid constraint errors
    const dropQuery = `
      DO $$ DECLARE
        r RECORD;
      BEGIN
        -- Disable triggers temporarily
        EXECUTE 'SET session_replication_role = replica';
        
        -- Drop all foreign key constraints first
        FOR r IN (SELECT conname, conrelid::regclass AS table_name FROM pg_constraint WHERE contype = 'f') LOOP
          EXECUTE 'ALTER TABLE ' || r.table_name || ' DROP CONSTRAINT IF EXISTS ' || r.conname || ' CASCADE';
        END LOOP;
        
        -- Drop all tables in the public schema
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS "' || r.tablename || '" CASCADE';
        END LOOP;
        
        -- Drop all sequences
        FOR r IN (SELECT relname FROM pg_class WHERE relkind = 'S' AND relnamespace = 'public'::regnamespace) LOOP
          EXECUTE 'DROP SEQUENCE IF EXISTS "' || r.relname || '" CASCADE';
        END LOOP;
        
        -- Drop all views
        FOR r IN (SELECT table_name FROM information_schema.views WHERE table_schema = 'public') LOOP
          EXECUTE 'DROP VIEW IF EXISTS "' || r.table_name || '" CASCADE';
        END LOOP;

        -- Reset triggers
        EXECUTE 'SET session_replication_role = DEFAULT';
      END $$;
    `;

    // Connect to the database using the DATABASE_URL from environment variable
    const databaseUrl = process.env.DATABASE_URL ||
      "postgres://root:mysecretpassword@localhost:5432/local";

    // Option 1: Use drizzle-orm to execute the SQL
    try {
      await db.execute(sql.raw(dropQuery));
      console.log(
        "Successfully dropped all tables and constraints using drizzle-orm",
      );
    } catch (drizzleError) {
      console.error("Failed to drop tables with drizzle-orm:", drizzleError);

      // Option 2: As a fallback, try using psql directly
      try {
        console.log("Trying with psql command instead...");
        const psqlCommand = `psql "${databaseUrl}" -c "${
          dropQuery.replace(/"/g, '\\"')
        }"`;
        await execAsync(psqlCommand);
        console.log(
          "Successfully dropped all tables and constraints using psql",
        );
      } catch (psqlError) {
        console.error("Failed to drop tables with psql:", psqlError);
        throw new Error("Could not drop database tables with either method");
      }
    }

    console.log(
      "Database has been reset successfully. All tables and data have been removed.",
    );
    console.log('You can now run "npm run db:push" to recreate the schema.');
  } catch (error) {
    console.error("Error resetting database:", error);
    process.exit(1);
  }
}

// Run the function and then exit
dropAllTables()
  .then(() => {
    console.log("Clean-up completed successfully.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to complete clean-up:", error);
    process.exit(1);
  });
