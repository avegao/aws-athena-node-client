'use strict';

const gulp = require('gulp');
const del = require('del');
const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json');
const tslint = require('gulp-tslint');
const sourcemaps = require('gulp-sourcemaps');

gulp.task('clean', () => {
  return del(['build/**']);
});

gulp.task('compile', () => {
  return tsProject
    .src()
    .pipe(sourcemaps.init())
    .pipe(tsProject())
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('build'));
});

gulp.task('tslint', () => {
  return gulp.src(['./src/**/*.ts', './test/**/*.ts'])
    .pipe(tslint())
    .pipe(tslint.report({
      bell: true,
      emitError: true,
      sort: true,
    }));
});

gulp.task('build', gulp.series('tslint', 'clean', 'compile'));

gulp.task('watch', () => {
  gulp.watch('./src/**/*.ts', gulp.series('build'))
});

gulp.task('default', gulp.series('build'));
