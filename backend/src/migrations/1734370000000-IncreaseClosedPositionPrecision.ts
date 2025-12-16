import { MigrationInterface, QueryRunner } from "typeorm";

export class IncreaseClosedPositionPrecision1734370000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Change realizedProfitLossPercentage from NUMERIC(10,2) to NUMERIC(20,2)
        // This allows for extreme percentage values (up to 999,999,999,999,999,999.99%)
        // which can occur when selling deposited assets with no cost basis
        await queryRunner.query(`
            ALTER TABLE "closed_positions" 
            ALTER COLUMN "realizedProfitLossPercentage" TYPE NUMERIC(20,2)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert back to NUMERIC(10,2)
        await queryRunner.query(`
            ALTER TABLE "closed_positions" 
            ALTER COLUMN "realizedProfitLossPercentage" TYPE NUMERIC(10,2)
        `);
    }
}
