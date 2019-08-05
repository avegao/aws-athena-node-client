import {suite, suiteSetup, suiteTeardown, test} from 'mocha';
import {assert} from 'chai';
import {AthenaClient} from '../src';

suite('AthenaClient', () => {
    let client: AthenaClient;

    suiteSetup(() => {
        client = new AthenaClient({
            awsConfig: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                apiVersion: '2017-05-18',
                region: process.env.AWS_DEFAULT_REGION,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
            bucketUri: process.env.AWS_ATHENA_BUCKET_URI,
            database: process.env.AWS_ATHENA_DATABASE,
            waitTime: 2,
            workGroup: process.env.AWS_ATHENA_WORK_GROUP,
        });
    });

    test('Test', async () => {
        const query = `
                        SELECT
        xAxis AS label,
        array_agg(name) AS name,
        array_agg(user_avg_in) AS data_mean_in,
        array_agg(user_avg_out) AS data_mean_out,
        array_agg(user_median_in) AS data_median_in,
        array_agg(user_median_out) AS data_median_out,
        array_agg(user_avg_percentile_05_in) AS data_5_percentile_in,
        array_agg(user_avg_percentile_05_out) AS data_5_percentile_out,
        array_agg(user_avg_percentile_95_in) AS data_95_percentile_in,
        array_agg(user_avg_percentile_95_in) AS data_95_percentile_out,
        array_agg(events_in) AS events_in,
        array_agg(events_out) AS events_out
FROM (
        SELECT
                carrier AS name,
                country AS xAxis,
                avg(avg_throughput_in) AS user_avg_in,
                avg(avg_throughput_out) AS user_avg_out,
                avg(percentile_50_in) AS user_median_in,
                avg(percentile_50_out) AS user_median_out,
                avg(percentile_05_in) AS user_avg_percentile_05_in,
                avg(percentile_05_out) AS user_avg_percentile_05_out,
                avg(percentile_95_in) AS user_avg_percentile_95_in,
                avg(percentile_95_out) AS user_avg_percentile_95_out,
                sum(events_in) AS events_in,
                sum(events_out) AS events_out
        FROM (
                SELECT
                        carrier,
                        id_rel_line_plan,
                        country,
                        tower_community,
                        tower_province_name,
                        tower_municipality_ine,
                        tower_zip,
                        tower_population_range_key,
                        avg(throughput_in) AS avg_throughput_in,
                        avg(throughput_out) AS avg_throughput_out,
                        approx_percentile(throughput_in, 0.05) AS percentile_05_in,
                        approx_percentile(throughput_out, 0.05) percentile_05_out,
                        approx_percentile(throughput_in, 0.50) AS percentile_50_in,
                        approx_percentile(throughput_out, 0.50) percentile_50_out,
                        approx_percentile(throughput_in, 0.95) AS percentile_95_in,
                        approx_percentile(throughput_out, 0.95) percentile_95_out,
                        count(throughput_in) AS events_in,
                        count(throughput_out) AS events_out
                FROM    "weplan_pro_db_raw".global_throughput
                WHERE   country = 'es'
                AND     ((
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('5', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('6', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('7', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('8', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('9', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('10', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('11', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('12', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('13', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('14', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('15', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('16', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('17', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('18', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('19', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('20', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('21', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('22', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('23', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('24', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('25', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('26', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('27', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('28', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('29', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('30', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('7', 2, '0')
                AND day = LPAD('31', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('8', 2, '0')
                AND day = LPAD('1', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('8', 2, '0')
                AND day = LPAD('2', 2, '0')
            ) OR (
                year = '2019'
                AND month = LPAD('8', 2, '0')
                AND day = LPAD('3', 2, '0')
            ))
                AND     time < 2 -- esto sube un poco los valores ya que actua como divisor, cuanto más grande este valor más bajo
                AND     (
                            (
                                session_sum > 1.048576
                                AND network_type IN ('4G')
                                AND throughput_out > 0
                            )
                            OR (
                                session_sum > 12.582912
                                AND network_type IN ('4G')
                                AND throughput_in > 0
                            )
                            OR (
                                session_sum > 1.048576
                                AND network_type = '3G'
                                AND throughput_out > 0
                            )
                            OR (
                                session_sum > 12.582912
                                AND network_type = '3G'
                                AND throughput_in > 0
                            )
                            OR (
                                session_sum > 1.048576
                                AND network_type = '2G'
                                AND throughput_out > 0
                            )
                            OR (
                                session_sum > 12.582912
                                AND network_type = '2G'
                                AND throughput_in > 0
                            )
                        ) -- siempre tiene que tener session_sum ya que son los eventos validos de thr, estos valores que están puestos son los de por defecto de la configuración
                AND connection_type_name = 'mob' -- siempre filtro de mob ya que es throughput de red
                AND network_type IN ('4G','3G','2G') AND carrier IN ('MOVISTAR','ORANGE','VODAFONE') AND CONTAINS(visualization_rights, 'ORANGE')
                GROUP BY 1, 2, 3, 4, 5, 6, 7, 8 -- primero agrupamos por usuario para luego hacer una media de los usuarios
        )
        GROUP BY 1, 2
        ORDER BY 1, 2
)
GROUP BY 1
`;

        const result = await client.executeQuery<any>(query);

        // assert.equal(result[0].test, 1);

        console.log(result);
    });
});
